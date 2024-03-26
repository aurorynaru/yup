import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    VersionedTransaction
} from '@solana/web3.js'
import fetch from 'cross-fetch'
import bs58 from 'bs58'

import fs from 'fs'
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    getMint
} from '@solana/spl-token'
import { Wallet } from '@project-serum/anchor'

const convert = (number, decimal) => {
    const num = Math.pow(10, decimal)
    return Math.round(number * num)
}

const feeAccountFn = async (referralAccountPubkey, mint) => {
    const [feeAccount] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('referral_ata'),
            referralAccountPubkey.toBuffer(), // your referral account public key
            mint.toBuffer() // the token mint, output mint for ExactIn, input mint for ExactOut.
        ],
        new PublicKey('REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3') // the Referral Program
    )

    return feeAccount
}

const jup = async () => {
    // It is recommended that you use your own RPC endpoint.
    // This RPC endpoint is only for demonstration purposes so that this example will run.
    const connection = new Connection(
        'https://mainnet.helius-rpc.com/?api-key=5ef2ec9f-025c-45c4-87d1-9a7f7ea69b4e',
        {
            commitment: 'confirmed'
        }
    )

    const secret = JSON.parse(
        fs.readFileSync(
            `./wallets/3XnQcdXokQZvsbV1iXqVAntp7DFQmpu2YCDZrLZ74gpH.json`
        )
    )

    const wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(secret)))

    const keypair = wallet.payer

    //input values
    //sol So11111111111111111111111111111111111111112
    const priorityFee = 55000

    const amt = 0.97833

    const slippage = 2000

    const input = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

    const output = 'So11111111111111111111111111111111111111112'

    const inputpk = new PublicKey(input)

    const mint = new PublicKey(output)

    const referralAccountPubkey = new PublicKey(
        'CEr5bqeMPz5eswoLKXiyiJ56juMcng6w2HSGiwe5r5ah'
    )

    const feeAccount = await feeAccountFn(referralAccountPubkey, mint)

    // const tokenInfo = await getAssociatedTokenAddress(
    //     capk,
    //     keypair.publicKey,
    //     false,
    //     TOKEN_PROGRAM_ID,
    //     ASSOCIATED_TOKEN_PROGRAM_ID
    // )

    const mintInfo = await getMint(connection, inputpk)
    const decimal = mintInfo.decimals

    // console.log(mintInfo)

    const tokenAmt = convert(amt, decimal)

    // Swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
    const quoteResponse = await (
        await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=${input}&outputMint=${output}&amount=${tokenAmt}&slippageBps=${slippage}&platformFeeBps=200`
        )
    ).json()
    // console.log({ quoteResponse })

    //console.log(quoteResponse)

    const { swapTransaction } = await (
        await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // quoteResponse from /quote api
                quoteResponse,
                // user public key to be used for the swap
                userPublicKey: keypair.publicKey.toString(),
                // auto wrap and unwrap SOL. default is true
                wrapAndUnwrapSol: true,
                feeAccount,
                // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
                // feeAccount: "fee_account_public_key"
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: priorityFee
            })
        })
    ).json()

    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64')
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf)

    // sign the transaction
    transaction.sign([wallet.payer])

    let tryAgain = true
    let objSignatureStatusResult
    let maxTriesCounter = 0
    const maxTries = 5

    while (tryAgain) {
        maxTriesCounter++
        const rawTransaction = transaction.serialize()
        const txid = await connection.sendRawTransaction(rawTransaction, {
            commitment: 'confirmed',
            skipPreflight: true,
            maxRetries: 2
        })

        console.log(`https://solscan.io/tx/${txid}`)
        await new Promise((r) => setTimeout(r, 1500))

        const result = await connection.getSignatureStatus(txid, {
            searchTransactionHistory: true
        })
        objSignatureStatusResult = JSON.parse(JSON.stringify(result))
        if (objSignatureStatusResult.value !== null) tryAgain = false
        if (maxTriesCounter > maxTries) tryAgain = false
    }

    // Execute the transaction
}

jup()
