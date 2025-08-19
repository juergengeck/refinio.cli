import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { QuicClient } from '../client/QuicClient';
import { loadConfig, loadPersonKeys } from '../config';

async function createClient(): Promise<QuicClient> {
  const config = await loadConfig();
  const client = new QuicClient(config.client);
  await client.connect();
  
  const personKeys = await loadPersonKeys();
  await client.authenticate(personKeys);
  
  return client;
}

export const recipeCommand = new Command('recipe')
  .description('Recipe operations');

recipeCommand
  .command('execute')
  .description('Execute a recipe')
  .argument('<name>', 'Recipe name')
  .option('-p, --params <path>', 'Path to parameters JSON file')
  .option('-i, --inline <json>', 'Inline JSON parameters')
  .action(async (name, options) => {
    const spinner = ora('Executing recipe...').start();
    
    try {
      let params = {};
      
      if (options.params) {
        const content = await fs.readFile(options.params, 'utf-8');
        params = JSON.parse(content);
      } else if (options.inline) {
        params = JSON.parse(options.inline);
      }
      
      const client = await createClient();
      const result = await client.executeRecipe(name, params);
      await client.disconnect();
      
      spinner.succeed('Recipe executed successfully');
      
      if (options.parent?.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('Result:'));
        console.log(result.result);
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

recipeCommand
  .command('list')
  .description('List available recipes')
  .option('-c, --category <category>', 'Filter by category')
  .action(async (options) => {
    const spinner = ora('Fetching recipes...').start();
    
    try {
      const client = await createClient();
      const result = await client.sendRequest('recipe.list' as any, {
        category: options.category
      });
      await client.disconnect();
      
      spinner.succeed(`Found ${result.count} recipes`);
      
      if (options.parent?.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const categories = new Map<string, any[]>();
        
        result.recipes.forEach((recipe: any) => {
          if (!categories.has(recipe.category)) {
            categories.set(recipe.category, []);
          }
          categories.get(recipe.category)!.push(recipe);
        });
        
        categories.forEach((recipes, category) => {
          console.log(chalk.cyan(`\n${category}:`));
          recipes.forEach(recipe => {
            console.log(`  ${chalk.green(recipe.name)} - ${recipe.description}`);
          });
        });
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

recipeCommand
  .command('schema')
  .description('Get recipe schema')
  .argument('<name>', 'Recipe name')
  .action(async (name, options) => {
    const spinner = ora('Fetching schema...').start();
    
    try {
      const client = await createClient();
      const result = await client.sendRequest('recipe.schema' as any, {
        name
      });
      await client.disconnect();
      
      spinner.succeed('Schema fetched successfully');
      
      if (options.parent?.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.cyan('Recipe:'), result.name);
        console.log(chalk.cyan('Description:'), result.description);
        console.log(chalk.cyan('Category:'), result.category);
        
        console.log(chalk.cyan('\nParameters:'));
        Object.entries(result.parameters).forEach(([name, param]: [string, any]) => {
          const required = param.required ? chalk.red('*') : '';
          console.log(`  ${name}${required}: ${param.type} - ${param.description || ''}`);
        });
        
        if (result.returns) {
          console.log(chalk.cyan('\nReturns:'), result.returns.type);
        }
        
        if (result.examples && result.examples.length > 0) {
          console.log(chalk.cyan('\nExamples:'));
          result.examples.forEach((example: any) => {
            console.log(`  ${JSON.stringify(example)}`);
          });
        }
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });