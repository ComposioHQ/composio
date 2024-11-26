import 'dotenv/config';
import { Langbase } from 'langbase';
import { OpenAIToolSet } from 'composio-core';
import { createInterface } from 'readline';
import { stdin as input, stdout as output, title } from 'process';
import dotenv from 'dotenv';
dotenv.config();
const langbase = new Langbase({
    apiKey: process.env.LANGBASE_API_KEY,
});

async function main() {
    const userMsg = 'Generate a PRD on a docker like application?';

    const response = await langbase.pipe.run({
        messages: [
            {
                role: 'user',
                content: userMsg,
            },
        ],
        stream: false,
        name: 'summary'
    });
    console.log('response: ', response);

    const readline = createInterface({ input, output });

    const answer = await new Promise(resolve => {
        readline.question('Do you want to write this in Google Doc? (yes/no): ', resolve);
    });

    readline.close();

    if (answer.toLowerCase() === 'yes') {
        const toolset = new OpenAIToolSet(process.env.COMPOSIO_API_KEY);
        const entity = toolset.client.getEntity('default');
        const result = await entity.execute(
            "GOOGLEDOCS_CREATE_DOCUMENT",
            {
				title: "Summary",
				text:response.completion
			},
        );
        console.log(result);
        console.log("Executed");
    } else {
        console.log("No");
    }
}

main();