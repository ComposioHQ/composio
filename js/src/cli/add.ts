import chalk from "chalk";
import { Command } from 'commander';

import {  setAxiosForBEAPICall } from "../sdk/utils/config";
import client from "../sdk/client/client";
import { Composio } from "../sdk";
import inquirer from "inquirer";
import open from "open";
export default class AddCommand {
    private program: Command;
    private composioClient: Composio;

    constructor(program: Command) {
        this.program = program;
        this.program
            .command('add')
            .description('Add a new app')
            .argument('<app-name>', 'The name of the app')
            .option('-f, --force', 'Force the connection setup')
            .action(this.handleAction.bind(this));

        this.composioClient = new Composio();
    }

    private async handleAction(appName: string,options: any): Promise<void> {

        let integration = null;
        integration = await this.composioClient.integrations.list({
            // @ts-ignore
            appName: appName.toLowerCase()
        })
        
        if(!integration){
            integration = await this.createIntegration(appName);
        }

        const firstIntegration = integration?.items[0];

        const connection = await this.composioClient.connectedAccounts.list({
            // @ts-ignore
            integrationId: firstIntegration.id
        });

        // @ts-ignore
        if (connection.items.length > 0 && options.force !== true){
            console.log(chalk.green("Connection already exists for", appName));
            return;
        }
   
        // @ts-ignore
        await this.setupConnections(firstIntegration.id);
      
    }   

    private async waitUntilConnected(connectedAccountId: string, timeout: number = 30000): Promise<void> {
        const startTime = Date.now();
        const pollInterval = 3000; // 3 seconds

        while (Date.now() - startTime < timeout) {
            try {
                const data = await this.composioClient.connectedAccounts.get({
                    connectedAccountId: connectedAccountId
                });

                // @ts-ignore
                if (data.status === "ACTIVE") {
                    return;
                }
            } catch (error) {
                console.error("Error checking connection status:", error);
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Connection did not become active within the specified timeout in ${timeout / 1000} seconds`);
    }


    private async setupConnections(integrationId: string){
        const data = await this.composioClient.integrations.get({
            integrationId: integrationId,
            
        });



        const { expectedInputFields } = data;

        const config = await this.collectInputFields(expectedInputFields);


        const connectionData = await this.composioClient.connectedAccounts.create({
            integrationId: integrationId,
            config: config,
        });


        if (connectionData.connectionStatus === "ACTIVE"){
            console.log(chalk.green("Connection created successfully"));
        }


        if (connectionData.redirectUrl){
            console.log(chalk.white("Redirecting to the app"), chalk.blue(connectionData.redirectUrl));
            open(connectionData.redirectUrl);
            
            await this.waitUntilConnected(connectionData.connectedAccountId);

            console.log(chalk.green("Connection is active"));
            process.exit(0);
        }
        
    }


    private async createIntegration(appName: string){


        const app  = await this.composioClient.apps.get({
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
        const authSchema = app.auth_schemes[0].auth_mode;

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
                return this.setupIntegration(app, authSchema, useComposioAuth, config);
            }else{
                // @ts-ignore
                config['useComposioAuth'] = false;
                return this.setupIntegration(app, authSchema, useComposioAuth, config);
            }
        }

  

        // @ts-ignore
        const authConfig = await this.collectInputFields(app.auth_schemes[0].fields);

        return this.setupIntegration(app, authSchema, false, authConfig);
    }

    async collectInputFields(fields: {
        name: string,
        displayName: string,
        display_name: string,
        expected_from_customer: boolean,
        required: boolean,
        type: string,
    }[]){

        const config = {};

        // Add inquirer, get all the field which are not expected_from_customer
    
        for(const field of fields){
            if(!!field.expected_from_customer){
                continue;
            }

            const prompt = await inquirer.prompt({
                type: 'input',
                name: field.name,
                message: field.displayName,
            });

            if(!!prompt[field.name]){
                // @ts-ignore
                config[field.name] = prompt[field.name];
            }
        }

        return config;
    }

    async setupIntegration(app: any, authMode: any, useComposioAuth: boolean, config: Record<string, any>){


        await this.composioClient.integrations.create({
            appId: app.id,
            authScheme: authMode,
            useComposioAuth: useComposioAuth,
            // @ts-ignore
            config: config,
        });

        return await this.composioClient.integrations.list({
            // @ts-ignore
            appName: appName.toLowerCase()
        });
    }

}