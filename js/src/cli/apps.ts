import chalk from "chalk";
import { Command } from 'commander';

import {  setAxiosForBEAPICall } from "../sdk/utils/config";
import client from "../sdk/client/client";

export default class AppsCommand {
    private program: Command;

    constructor(program: Command) {
        this.program = program;
        this.program
            .command('apps')
            .description('List all apps you have access to')
            .action(this.handleAction.bind(this));
    }

    private async handleAction(options: { browser: boolean }): Promise<void> {
        setAxiosForBEAPICall();
        const {data,error} = await client.apps.getApps({});

        if(!!error){
            console.log(chalk.red((error as any).message));
            return;
        }

        console.log("Here are the apps you have access to:");

        for(const app of data?.items || []){
            console.log(app.key);
        }
    }   
}