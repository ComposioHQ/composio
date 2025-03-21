from agents import Agent, Runner, function_tool
from dotenv import load_dotenv
from composio_openai_agents import ComposioToolSet, App, Action
from pathlib import Path


load_dotenv()

toolset = ComposioToolSet()

security_checks = """
1. Sanitize all user inputs (DOMPurify, data-specific sanitization)
2. Secure env vars (.gitignore, production configs)
3. Update production env vars (NEXTAUTH_URL, NEXTAUTH_SECRET)
4. Use API abstraction layer (no direct DB calls from client)
5. Implement rate limiting (IP/user based, Redis for scale)
6. Secure auth setup (NextAuth/Clerk/Supabase)
7. Update auth callback URLs for production
8. Disable NextAuth debug in production
9. Use production DB (PostgreSQL/MySQL, not SQLite)
10. Fix ALL linter errors
11. Set up production logging (Winston/Pino, no sensitive data)
12. User-friendly errors (no sensitive details)
13. Have incident response plan
14. Add Content Security Policy (next.config.js)
15. Regular dependency scans (npm audit, Dependabot)
16. Server-side input validation (Zod)
17. Production DB practices (backups, pooling, monitoring)
"""

@function_tool
def recursive_list_files(directory:str)->list:
    """
    Recursively list all files in a directory and its subdirectories
    Args:
        directory: Path to the directory to scan
    """
    all_files = []
    path = Path(directory)
    
    try:
        for item in path.rglob("*"):
            if item.is_file():
                all_files.append(str(item))
        return all_files
    except Exception as e:
        print(f"Error scanning directory: {e}")
        return []

tools = toolset.get_tools(apps=[App.FILETOOL, App.SHELLTOOL])
tools.extend([recursive_list_files])

security_agent = Agent(name="Security Analyst", instructions=f"You are a security analyst ai agent that assesses codebase and points out security flaws. Here's the 17 things to check for:{security_checks} use the tools available to you. Read the important files using File Tool, and suggest changes in the code. List the files you've analysed as well.", tools=tools, model='o3-mini')

codebase_agent = Agent(name='Codebase Analyst', instructions='Analyse the codebase at a given path, go through all the files recursively and store it in a file using the tools available to you', tools=tools)

triage_agent = Agent(
    name='Triage Agent',
    instructions='The file path is given to you by the user, hand off to codebase agent to analyse the files in that project, then hand it off to Security analyst agent to read through the file and give output'
    ,handoffs=[security_agent, codebase_agent]
)
result = Runner.run_sync(triage_agent, "Analyse the codebase at js/examples/vercel/nextjs-vercel-demo go through all the files recursively, read them and give me a critical security analysis and suggestions")
print(result.final_output)