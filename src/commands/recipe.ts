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
  .description('Recipe operations (data structure definitions)');

recipeCommand
  .command('register')
  .description('Register a new recipe (data structure definition)')
  .option('-f, --file <path>', 'Path to recipe JSON file')
  .option('-i, --inline <json>', 'Inline JSON recipe definition')
  .action(async (options) => {
    const spinner = ora('Registering recipe...').start();
    
    try {
      let recipe;
      
      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        recipe = JSON.parse(content);
      } else if (options.inline) {
        recipe = JSON.parse(options.inline);
      } else {
        spinner.fail('No recipe definition provided');
        process.exit(1);
      }
      
      const client = await createClient();
      const result = await client.registerRecipe(recipe);
      await client.disconnect();
      
      spinner.succeed('Recipe registered successfully');
      
      if (options.parent?.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('Recipe registered:'), recipe.name);
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

recipeCommand
  .command('list')
  .description('List registered recipes (data structures)')
  .option('-c, --category <category>', 'Filter by category')
  .action(async (options) => {
    const spinner = ora('Fetching recipes...').start();
    
    try {
      const client = await createClient();
      const result = await client.listRecipes(options.category);
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
            console.log(`  ${chalk.green(recipe.name)} (${recipe.type}) - ${recipe.description}`);
            if (recipe.properties) {
              console.log(`    Properties: ${Object.keys(recipe.properties).join(', ')}`);
            }
          });
        });
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

recipeCommand
  .command('get')
  .description('Get recipe definition (data structure)')
  .argument('<name>', 'Recipe name')
  .action(async (name, options) => {
    const spinner = ora('Fetching recipe...').start();
    
    try {
      const client = await createClient();
      const result = await client.getRecipe(name);
      await client.disconnect();
      
      spinner.succeed('Recipe fetched successfully');
      
      if (options.parent?.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const recipe = result.recipe;
        console.log(chalk.cyan('Recipe:'), recipe.name);
        console.log(chalk.cyan('Type:'), recipe.type);
        console.log(chalk.cyan('Description:'), recipe.description);
        console.log(chalk.cyan('Category:'), recipe.category);
        
        if (recipe.properties) {
          console.log(chalk.cyan('\nProperties (Data Structure):'));
          Object.entries(recipe.properties).forEach(([name, prop]: [string, any]) => {
            const required = prop.required ? chalk.red('*') : '';
            let propDesc = `  ${name}${required}: ${prop.type}`;
            if (prop.format) propDesc += ` (${prop.format})`;
            if (prop.refType) propDesc += ` -> ${prop.refType}`;
            if (prop.maxLength) propDesc += ` (max: ${prop.maxLength})`;
            console.log(propDesc);
          });
        }
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });