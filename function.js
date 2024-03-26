const web3 = require('@solana/web3.js')
const splToken = require('@solana/spl-token')

const tokenAccount = async ({
    connection,
    payer,
    mint,
    owner,
    microLamports,
    allowOwnerOffCurve = false,
    commitment = 'confirmed',
    programId = splToken.TOKEN_PROGRAM_ID,
    associatedTokenProgramId = splToken.ASSOCIATED_TOKEN_PROGRAM_ID
}) => {
    const associatedToken = await splToken.getAssociatedTokenAddress(
        mint,
        owner,
        allowOwnerOffCurve,
        programId,
        associatedTokenProgramId
    )

    // This is the optimal logic, considering TX fee, client-side computation, RPC roundtrips and guaranteed idempotent.
    // Sadly we can't do this atomically.
    let account
    try {
        account = await splToken.getAccount(
            connection,
            associatedToken,
            commitment,
            programId
        )
    } catch (error) {
        // TokenAccountNotFoundError can be possible if the associated address has already received some lamports,
        // becoming a system account. Assuming program derived addressing is safe, this is the only case for the
        // TokenInvalidAccountOwnerError in this code path.
        if (
            error instanceof splToken.TokenAccountNotFoundError ||
            error instanceof splToken.TokenInvalidAccountOwnerError
        ) {
            // As this isn't atomic, it's possible others can create associated accounts meanwhile.

            const confirmOptions = {
                commitment: 'confirmed',
                maxRetries: 12,
                skipPreflight: false
            }

            const modifyComputeUnits =
                web3.ComputeBudgetProgram.setComputeUnitLimit({
                    units: 1000000
                })

            const addPriorityFee =
                web3.ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: microLamports
                })

            try {
                const transaction = new web3.Transaction()
                    .add(modifyComputeUnits)
                    .add(addPriorityFee)
                    .add(
                        splToken.createAssociatedTokenAccountInstruction(
                            payer.publicKey,
                            associatedToken,
                            owner,
                            mint,
                            programId,
                            associatedTokenProgramId
                        )
                    )

                await web3.sendAndConfirmTransaction(
                    connection,
                    transaction,
                    [payer],
                    confirmOptions
                )
            } catch (error) {
                // Ignore all errors; for now there is no API-compatible way to selectively ignore the expected
                // instruction error if the associated account exists already.
            }

            // Now this should always succeed
            account = await splToken.getAccount(
                connection,
                associatedToken,
                commitment,
                programId
            )
        } else {
            throw error
        }
    }

    if (!account.mint.equals(mint)) throw new splToken.TokenInvalidMintError()
    if (!account.owner.equals(owner))
        throw new splToken.TokenInvalidOwnerError()

    return account
}

module.exports = tokenAccount
