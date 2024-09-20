import typing as t  
from composio.tools.base.local import LocalAction, LocalTool  
from .actions import EmbeddingGenerator, QueryHandler  
from sklearn.feature_extraction.text import TfidfVectorizer  

class RAGTool(LocalTool, autoload=True):  
    

    logo = "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"   

    @classmethod  
    def actions(cls) -> list[t.Type[LocalAction]]:  
        return [EmbeddingGenerator, QueryHandler]