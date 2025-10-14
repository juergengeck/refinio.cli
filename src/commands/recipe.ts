import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { createProfileClient } from '../client/ProfileAwareClient.js';

async function createClient(profileAlias?: string): Promise<any> {
  return createProfileClient(profileAlias);
}

export const recipeCommand = new Command('recipe')
  .description('Recipe operations (data structure definitions)');

recipeCommand
  .command('register')
  .description('Register a new recipe (data structure definition)')
  .option('-f, --file <path>', 'Path to recipe JSON file')
  .option('-i, --inline <json>', 'Inline JSON recipe definition')
  .option('-p, --profile <alias>', 'Use specific profile')
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
      
      const client = await createClient(options.profile);
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
  .option('-t, --type <recipeType>', 'Filter by recipe type (what Recipe defines these recipes)')
  .option('-p, --profile <alias>', 'Use specific profile')
  .action(async (options) => {
    const spinner = ora('Fetching recipes...').start();
    
    try {
      const client = await createClient(options.profile);
      const result = await client.listRecipes(options.type);
      await client.disconnect();
      
      spinner.succeed(`Found ${result.count} recipes`);
      
      if (options.parent?.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Group recipes by their recipe type
        const byRecipeType = new Map<string, any[]>();
        
        result.recipes.forEach((recipe: any) => {
          const recipeType = recipe.$recipe$ || 'Recipe';
          if (!byRecipeType.has(recipeType)) {
            byRecipeType.set(recipeType, []);
          }
          byRecipeType.get(recipeType)!.push(recipe);
        });
        
        byRecipeType.forEach((recipes, recipeType) => {
          console.log(chalk.cyan(`\nRecipes defined by ${recipeType}:`));
          recipes.forEach(recipe => {
            console.log(`  ${chalk.green(recipe.$type$)} - ${recipe.description || 'No description'}`);
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
  .option('-p, --profile <alias>', 'Use specific profile')
  .action(async (name, options) => {
    const spinner = ora('Fetching recipe...').start();
    
    try {
      const client = await createClient(options.profile);
      const result = await client.getRecipe(name);
      await client.disconnect();
      
      spinner.succeed('Recipe fetched successfully');
      
      if (options.parent?.parent?.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const recipe = result.recipe;
        console.log(chalk.cyan('Recipe Type:'), recipe.$type$);
        console.log(chalk.cyan('Defined by Recipe:'), recipe.$recipe$ || 'Recipe');
        console.log(chalk.cyan('Description:'), recipe.description || 'No description');
        
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