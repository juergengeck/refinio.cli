import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Debug command for one.filer troubleshooting
export const debugCommand = new Command('debug')
  .description('Debug and monitoring tools for one.filer');

// Check system status
debugCommand
  .command('status')
  .description('Check overall system status')
  .action(async () => {
    const spinner = ora('Checking system status...').start();
    
    try {
      const checks = [];
      
      // Check Node.js version
      const nodeVersion = process.version;
      checks.push({
        name: 'Node.js',
        status: parseInt(nodeVersion.match(/^v(\d+)/)?.[1] || '0') >= 18,
        info: nodeVersion
      });
      
      // Check platform
      checks.push({
        name: 'Platform',
        status: true,
        info: process.platform
      });
      
      // Check for FUSE on Linux
      if (process.platform === 'linux') {
        const fuseExists = fs.existsSync('/dev/fuse');
        checks.push({
          name: 'FUSE',
          status: fuseExists,
          info: fuseExists ? 'Available' : 'Not installed'
        });
      }
      
      // Check for running instances
      try {
        const { stdout } = await execAsync('ps aux | grep "one.filer" | grep -v grep');
        const processes = stdout.trim().split('\n').length;
        checks.push({
          name: 'Running instances',
          status: processes > 0,
          info: `${processes} instance(s)`
        });
      } catch {
        checks.push({
          name: 'Running instances',
          status: false,
          info: 'None found'
        });
      }
      
      spinner.succeed('System status checked');
      
      console.log(chalk.bold('\nSystem Status:'));
      for (const check of checks) {
        const icon = check.status ? chalk.green('✓') : chalk.red('✗');
        console.log(`${icon} ${check.name}: ${check.info}`);
      }
      
    } catch (error: any) {
      spinner.fail(`Status check failed: ${error.message}`);
      process.exit(1);
    }
  });

// Check filesystem structure
debugCommand
  .command('fs-tree <mountPath>')
  .description('Display filesystem tree structure')
  .option('-d, --depth <n>', 'Maximum depth', '3')
  .action(async (mountPath, options) => {
    const spinner = ora('Reading filesystem...').start();
    
    try {
      if (!fs.existsSync(mountPath)) {
        throw new Error(`Mount path not found: ${mountPath}`);
      }
      
      spinner.succeed('Filesystem structure:');
      
      const printTree = (dir: string, prefix = '', depth = 0) => {
        if (depth >= parseInt(options.depth)) return;
        
        const files = fs.readdirSync(dir);
        files.forEach((file, index) => {
          const fullPath = path.join(dir, file);
          const isLast = index === files.length - 1;
          const stats = fs.statSync(fullPath);
          
          const icon = stats.isDirectory() ? '📁' : '📄';
          const connector = isLast ? '└── ' : '├── ';
          
          console.log(`${prefix}${connector}${icon} ${file}`);
          
          if (stats.isDirectory()) {
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            printTree(fullPath, newPrefix, depth + 1);
          }
        });
      };
      
      console.log(`📁 ${mountPath}`);
      printTree(mountPath);
      
    } catch (error: any) {
      spinner.fail(`Failed to read filesystem: ${error.message}`);
      process.exit(1);
    }
  });

// Check connections
debugCommand
  .command('connections <instancePath>')
  .description('Check active connections')
  .action(async (instancePath) => {
    const spinner = ora('Checking connections...').start();
    
    try {
      // Look for connection info in debug filesystem
      const debugPath = path.join(instancePath, 'mount', 'debug');
      
      if (!fs.existsSync(debugPath)) {
        throw new Error('Debug filesystem not found');
      }
      
      // Read connection files
      const files = fs.readdirSync(debugPath);
      const connectionFiles = files.filter(f => f.includes('connection'));
      
      spinner.succeed(`Found ${connectionFiles.length} connection files`);
      
      for (const file of connectionFiles) {
        const filePath = path.join(debugPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        console.log(chalk.bold(`\n${file}:`));
        console.log(chalk.gray(content.substring(0, 500)));
      }
      
    } catch (error: any) {
      spinner.fail(`Failed to check connections: ${error.message}`);
      process.exit(1);
    }
  });

// Check logs
debugCommand
  .command('logs <instancePath>')
  .description('View instance logs')
  .option('-n, --lines <n>', 'Number of lines', '50')
  .option('-f, --follow', 'Follow log output')
  .action(async (instancePath, options) => {
    const spinner = ora('Reading logs...').start();
    
    try {
      // Look for log files
      const logPaths = [
        path.join(instancePath, 'filer.log'),
        path.join(instancePath, 'debug.log'),
        path.join(instancePath, 'mount', 'debug', 'log.txt')
      ];
      
      let logFound = false;
      
      for (const logPath of logPaths) {
        if (fs.existsSync(logPath)) {
          spinner.succeed(`Reading log: ${logPath}`);
          
          if (options.follow) {
            // Use tail -f for following
            const tail = exec(`tail -f -n ${options.lines} "${logPath}"`);
            tail.stdout?.on('data', data => console.log(data));
            tail.stderr?.on('data', data => console.error(chalk.red(data)));
          } else {
            // Read last n lines
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n');
            const lastLines = lines.slice(-parseInt(options.lines));
            console.log(lastLines.join('\n'));
          }
          
          logFound = true;
          break;
        }
      }
      
      if (!logFound) {
        throw new Error('No log files found');
      }
      
    } catch (error: any) {
      spinner.fail(`Failed to read logs: ${error.message}`);
      process.exit(1);
    }
  });

// Performance metrics
debugCommand
  .command('perf <mountPath>')
  .description('Measure filesystem performance')
  .action(async (mountPath) => {
    const spinner = ora('Running performance tests...').start();
    
    try {
      const results = [];
      const testDir = path.join(mountPath, 'perf-test-' + Date.now());
      
      // Create test directory
      fs.mkdirSync(testDir, { recursive: true });
      
      // Test 1: Write performance
      const writeStart = Date.now();
      const testFiles = 100;
      
      for (let i = 0; i < testFiles; i++) {
        fs.writeFileSync(
          path.join(testDir, `test-${i}.txt`),
          `Test content ${i}`.repeat(100)
        );
      }
      
      const writeTime = Date.now() - writeStart;
      results.push({
        test: 'Write 100 files',
        time: writeTime,
        rate: Math.round((testFiles * 1000) / writeTime) + ' files/sec'
      });
      
      // Test 2: Read performance
      const readStart = Date.now();
      
      for (let i = 0; i < testFiles; i++) {
        fs.readFileSync(path.join(testDir, `test-${i}.txt`));
      }
      
      const readTime = Date.now() - readStart;
      results.push({
        test: 'Read 100 files',
        time: readTime,
        rate: Math.round((testFiles * 1000) / readTime) + ' files/sec'
      });
      
      // Test 3: List performance
      const listStart = Date.now();
      
      for (let i = 0; i < 10; i++) {
        fs.readdirSync(testDir);
      }
      
      const listTime = Date.now() - listStart;
      results.push({
        test: 'List directory 10x',
        time: listTime,
        rate: Math.round((10 * 1000) / listTime) + ' ops/sec'
      });
      
      // Clean up
      for (let i = 0; i < testFiles; i++) {
        fs.unlinkSync(path.join(testDir, `test-${i}.txt`));
      }
      fs.rmdirSync(testDir);
      
      spinner.succeed('Performance tests complete');
      
      console.log(chalk.bold('\nPerformance Results:'));
      for (const result of results) {
        console.log(`${result.test}: ${result.time}ms (${result.rate})`);
      }
      
    } catch (error: any) {
      spinner.fail(`Performance test failed: ${error.message}`);
      process.exit(1);
    }
  });

// Memory usage
debugCommand
  .command('memory')
  .description('Check memory usage')
  .action(async () => {
    const spinner = ora('Checking memory...').start();
    
    try {
      const used = process.memoryUsage();
      
      spinner.succeed('Memory usage:');
      
      console.log(chalk.bold('\nProcess Memory:'));
      console.log(`RSS: ${Math.round(used.rss / 1024 / 1024)} MB`);
      console.log(`Heap Total: ${Math.round(used.heapTotal / 1024 / 1024)} MB`);
      console.log(`Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)} MB`);
      console.log(`External: ${Math.round(used.external / 1024 / 1024)} MB`);
      
      // Try to get system memory
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('free -m');
        console.log(chalk.bold('\nSystem Memory:'));
        console.log(stdout);
      }
      
    } catch (error: any) {
      spinner.fail(`Memory check failed: ${error.message}`);
      process.exit(1);
    }
  });

// Cleanup
debugCommand
  .command('cleanup <instancePath>')
  .description('Clean up test data and temporary files')
  .option('--force', 'Force cleanup without confirmation')
  .action(async (instancePath, options) => {
    const spinner = ora('Cleaning up...').start();
    
    try {
      const toClean = [
        path.join(instancePath, 'mount', 'test-*'),
        path.join(instancePath, 'mount', 'perf-test-*'),
        path.join(instancePath, '*.log'),
        path.join(instancePath, 'mount', 'debug', '*.tmp')
      ];
      
      let cleaned = 0;
      
      for (const pattern of toClean) {
        const dir = path.dirname(pattern);
        const filePattern = path.basename(pattern);
        
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          
          for (const file of files) {
            if (file.match(filePattern.replace('*', '.*'))) {
              const fullPath = path.join(dir, file);
              
              if (!options.force) {
                console.log(chalk.yellow(`Would delete: ${fullPath}`));
              } else {
                if (fs.statSync(fullPath).isDirectory()) {
                  fs.rmSync(fullPath, { recursive: true });
                } else {
                  fs.unlinkSync(fullPath);
                }
                cleaned++;
              }
            }
          }
        }
      }
      
      if (options.force) {
        spinner.succeed(`Cleaned up ${cleaned} items`);
      } else {
        spinner.succeed('Dry run complete. Use --force to actually delete');
      }
      
    } catch (error: any) {
      spinner.fail(`Cleanup failed: ${error.message}`);
      process.exit(1);
    }
  });