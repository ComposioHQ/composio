from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solana.rpc.api import Client
from solders.system_program import TransferParams, transfer
from solders.message import Message
from solders.transaction import Transaction
from composio import action
import base58
from solders.keypair import Keypair
from solders.signature import Signature
import csv



@action(toolname='solanakit', requires=['solana','solders'])
def get_balance(wallet_address: str, network: str = "devnet") -> str:
    """
    Get the SOL balance of your wallet
    :param wallet_address: address of your wallet
    :param network: network to get the balance on
    :return wallet_balance: balance of wallet
    """
    try:
        from solders.pubkey import Pubkey # type: ignore
        from solana.rpc.api import Client
        http_client = Client(f"https://api.{network}.solana.com")
        res = http_client.get_balance(pubkey=Pubkey.from_string(wallet_address))
        return str(res.value/ 1_000_000_000)+" SOL"
    except ValueError as e:
        return f"Error: Invalid wallet address - {str(e)}"
    except Exception as e:
        return f"Error getting balance: {str(e)}"


@action(toolname='solanakit', requires=['solana','solders'])
def create_wallet() -> str: 
    """
    Create a new wallet
    :return wallet_balance: balance of wallet
    """
    try:
        WALLETS_AMOUNT = 1

        with open("wallets.csv", 'w', newline='') as csvfile:
            csv_writer = csv.writer(csvfile)
            csv_writer.writerow(["WALLET", "PRIVATE KEY"])

            for x in range(WALLETS_AMOUNT):
                account = Keypair()
                privateKey = base58.b58encode(account.secret() + base58.b58decode(str(account.pubkey()))).decode('utf-8')

                csv_writer.writerow([account.pubkey(), privateKey])
        return "Wallet created successfully, public key and private key saved in wallets.csv"
    except PermissionError:
        return "Error: Unable to write to wallets.csv - Permission denied"
    except Exception as e:
        return f"Error creating wallet: {str(e)}"

@action(toolname='solanakit', requires=['solana','solders'])
def send_sol(sender_private_key: str, receiver_public_key: str, amount: str, network: str = "devnet") -> str:
    """
    Send SOL to a wallet
    :param sender_private_key: private key of the sender
    :param receiver_public_key: address of the wallet to send SOL to
    :param amount: amount of SOL to send, should be in lamports
    :param network: network to send the transaction on
    :return transaction_hash: transaction hash
    """
    try:
        # Create keypair for sender
        # Use a valid Base58-encoded private key for the sender
        sender_keypair = Keypair.from_base58_string(sender_private_key)
        sender_public_key = sender_keypair.pubkey()

        # Define receiver's public key
        receiver_public_key_ = Pubkey.from_string(receiver_public_key)

        # Build the transfer instruction
        ixns = [
            transfer(
                TransferParams(
                    from_pubkey=sender_public_key,
                    to_pubkey=receiver_public_key_,
                    lamports=int(amount)
                )
            )
        ]

        # Create a message with the transaction
        msg = Message(ixns, sender_public_key)

        # Connect to a Solana client
        client = Client(f"https://api.{network}.solana.com")  # Using Devnet RPC endpoint

        # Fetch the latest blockhash
        latest_blockhash = client.get_latest_blockhash().value.blockhash

        # Create the transaction
        transaction = Transaction([sender_keypair], msg, latest_blockhash)

        # Send the transaction
        response = client.send_transaction(transaction)
        print("Transaction response:", response)
        return "Transaction sent successfully: "+str(response)
    except ValueError as e:
        return f"Error: Invalid key format - {str(e)}"
    except Exception as e:
        return f"Error sending transaction: {str(e)}"

@action(toolname='solanakit', requires=['solana','solders'])
def get_transaction_status(transaction_hash: str, network: str = "devnet") -> str:
    """
    Get the status of a transaction
    :param transaction_hash: hash of the transaction
    :param network: network to get the transaction status on
    :return transaction_status: status of the transaction
    """
    try:
        client = Client(f"https://api.{network}.solana.com")  # Using Devnet RPC endpoint
        res = client.get_transaction(tx_sig=Signature.from_string(transaction_hash))
        return str(res)
    except ValueError as e:
        return f"Error: Invalid transaction hash - {str(e)}"
    except Exception as e:
        return f"Error getting transaction status: {str(e)}"

@action(toolname='solanakit', requires=['solana','solders'])
def request_airdrop(wallet_address: str, amount: str, network: str = "devnet") -> str:
    """
    Request an airdrop of SOL to a wallet
    :param wallet_address: address of the wallet to request an airdrop to
    :param amount: amount of SOL to request, should be in lamports
    :param network: network to request the airdrop on
    :return airdrop_status: status of the airdrop
    """
    try:
        http_client = Client(f"https://api.{network}.solana.com")
        res = http_client.request_airdrop(Pubkey.from_string(wallet_address),lamports=int(amount))
        return str(res)
    except ValueError as e:
        return f"Error: Invalid wallet address or amount - {str(e)}"
    except Exception as e:
        return f"Error requesting airdrop: {str(e)}"