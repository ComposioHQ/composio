1. set your github token in environment 
    GITHUB_ACCESS_TOKEN=""
2. set a github repo, that you want to solve issue from 
    HARD_CODED_REPO_NAME=""
3. Install Docker, then start Docker locally.
4. Run `docker pull sweagent/swe-agent:latest`
5. Work with your virtual-env and install dependencies
6. run `python ~/composio_sdk/examples/swe/try-swe.py`
7. change the issue according to your task / or anything you want to fix -- give it a try 🚀🚀
8. task description is given in file `cat ~/composio_sdk/examples/swe/task_config.yaml`


## Docker Issues

1. if docker client is not working - 
   - socket issue: allow use of default socket - https://github.com/princeton-nlp/SWE-agent/issues/159
   - if socket is at non-standard location - https://github.com/princeton-nlp/SWE-agent/issues/20#issuecomment-2047506005
2. if getting errors like "https+url" is not valid scheme - update `requests` package in python
   `pip install --upgrade requests` 
