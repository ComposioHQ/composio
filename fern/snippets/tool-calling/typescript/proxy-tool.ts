import { Composio } from '@composio/core';

const composio = new Composio({apiKey: "your_composio_key"});

// Send a proxy request to the endpoint
const { data } = await composio.tools.proxyExecute({
    endpoint:'/repos/composiohq/composio/issues/1',
    method: 'GET',
    connectedAccountId: 'ca_jI*****', // use connected account for github
     parameters:[
        {
            "name": "Accept",
            "value": "application/vnd.github.v3+json",
            "in": "header",
        },
    ],
});

console.log(data);
  