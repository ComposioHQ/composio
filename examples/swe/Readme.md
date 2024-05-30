1. set your github token in environment 
    GITHUB_ACCESS_TOKEN=""
2. Install Docker, then start Docker locally. 
3. Run `docker pull sweagent/swe-agent:latest`
4. Work with your virtual-env and install dependencies 
5. run `python ~/composio_sdk/examples/swe/try-swe.py`
6. change the issue according to your task / or anything you want to fix -- give it a try 🚀🚀 
7. task description is given in file `cat ~/composio_sdk/examples/swe/task_config.yaml`


## Docker Issues

1. if docker client is not working - 
   - socket issue: allow use of default socket - https://github.com/princeton-nlp/SWE-agent/issues/159
   - if socket is at non-standard location - https://github.com/princeton-nlp/SWE-agent/issues/20#issuecomment-2047506005
2. if getting errors like "https+url" is not valid scheme - update `requests` package in python
   `pip install --upgrade requests` 
