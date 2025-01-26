from composio import ComposioToolSet, action, Action
from dotenv import load_dotenv
load_dotenv()
@action(toolname='solana', requires=['solana','solders'])
def get_balance(wallet_address: str) -> str:
    """
    Get the SOL balance of your wallet
    :param wallet_address: address of your wallet
    :return wallet_balance: balance of wallet
    """
    from solders.pubkey import Pubkey # type: ignore
    from solana.rpc.api import Client
    http_client = Client("https://api.devnet.solana.com")
    res = http_client.get_balance(pubkey=Pubkey.from_string(wallet_address))
    return str(res.value/ 1_000_000_000)+" SOL"

@action(toolname='search', requires=[])
def search(search_token: str) -> str:
    """
    Get the SOL balance of your wallet
    :param search_token: Token name that you want info on
    :return info: Detailed realtime info on the token
    """
    toolset = ComposioToolSet()
    resp = toolset.execute_action(
        action=Action.TAVILY_TAVILY_SEARCH, 
        params={},
        text=f'Get realtime info on {search_token} and analyse whether it can be bought or not.'
    )
    return str(resp)