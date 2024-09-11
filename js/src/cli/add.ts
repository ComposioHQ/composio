import chalk from "chalk";
import { Command } from 'commander';

import {  setAxiosForBEAPICall } from "../sdk/utils/config";
import client from "../sdk/client/client";
import { Composio } from "../sdk";
import inquirer from "inquirer";
export default class AddCommand {
    private program: Command;

    constructor(program: Command) {
        this.program = program;
        this.program
            .command('add')
            .description('Add a new app')
            .argument('<app-name>', 'The name of the app')
            .action(this.handleAction.bind(this));
    }

    private async handleAction(appName: string): Promise<void> {

        const composioClient = new Composio();

        let integration = null;
        integration = await composioClient.integrations.list({
            // @ts-ignore
            appName: appName.toLowerCase()
        });
        
        if(!integration||true){
            integration = await this.createIntegration(appName);
        }
        // console.log("getIntegration", getIntegration);
        // const integration = getIntegration?.items.find((integration: any) => integration.appName === appName.toLowerCase());
        // console.log("integration", integration);
        // const apps = await composioClient.apps.list();
        // console.log("apps", apps);
        // setAxiosForBEAPICall();
        // const {data,error} = await client.apps.getApps({});

        // if(!!error){
        //     console.log(chalk.red((error as any).message));
        //     return;
        // }

        // console.log("Here are the apps you have access to:");

        // for(const app of data?.items || []){
        //     console.log(app.key);
        // }
    }   


    private async createIntegration(appName: string){

        const composioClient = new Composio();
        const app  = await composioClient.apps.get({
            appKey: appName.toLowerCase(),
        });


        const config = {}

        const integrationPrompt = await inquirer.prompt({
            type: 'input',
            name: 'integrationName',
            message: 'Enter the app name',
        });

        if(!integrationPrompt.integrationName){
            console.log(chalk.red("Integration name is required"));
            return;
        }

        // @ts-ignore
        config['name'] = integrationPrompt.integrationName;

        // @ts-ignore
        if (app?.testConnectors?.length > 0 || !!app.no_auth){
            let useComposioAuth = false;
            if(!app.no_auth){
                const doYouWantToUseComposioAuth = await inquirer.prompt({
                    type: 'confirm',
                    name: 'doYouWantToUseComposioAuth',
                    message: 'Do you want to use Composio Auth?',
                });
                useComposioAuth = doYouWantToUseComposioAuth.doYouWantToUseComposioAuth;
            }
            

            if (useComposioAuth) {
                // @ts-ignore
                config['useComposioAuth'] = true;
                return this.setupIntegration(app, config);
            }else{
                // @ts-ignore
                config['useComposioAuth'] = false;
                return this.setupIntegration(app, config);
            }
        }


    }

    async collectInputFields(app: any){

    }

    async setupIntegration(app: any, config: any){

    }

}