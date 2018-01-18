const path = require('path');
const chokidar = require('chokidar');
const ora = require('ora');
const notifier = require('node-notifier');
const write = require('../lib/write');
const mkdirp = require('../lib/mkdirp');
const log = require('../lib/log');
const { exec } = require('child_process');

module.exports = options => {
  const {cartridges, codeVersion, webdav, request, silent = false, watch} = options;
  let {ignored_dirs, gulp_exceptions} = watch;
  ignored_dirs = Array.isArray(ignored_dirs) ? ignored_dirs : [];
  gulp_exceptions = Array.isArray(gulp_exceptions) ? gulp_exceptions : [];

  try {
    log.info(`Pushing ${codeVersion} changes to ${webdav}`);

    const uploading = new Set();
    let spinner;
    let text;

    const ignoredDirs = ignored_dirs.map(item => path.join(process.cwd(), item));

    const watcher = chokidar.watch('dir', {
      ignored: [/[/\\]\./, '**/node_modules/**', ...ignoredDirs],
      ignoreInitial: true,
      persistent: true,
      atomic: true
    });

    if (options.spinner) {
      text = `Watching '${cartridges}' for ${webdav} [Ctrl-C to Cancel]`;
      spinner = ora(text).start();
    }

    watcher.add(path.join(process.cwd(), cartridges));

    const upload = async file => {
      const src = path.relative(process.cwd(), file);

      if (!uploading.has(src)) {
        uploading.add(src);
        if (!silent) {
          notifier.notify({
            title: 'File Changed',
            message: src
          });
        }
        if (spinner) {
          spinner.stopAndPersist({text: `${src} changed`});
          spinner.text = text;
          spinner.start();
        }

        try {
          const dir = path.dirname(src).replace(path.normalize(cartridges), '');
          const dest = path.join('/', 'Cartridges', codeVersion, dir);
          await mkdirp(dest, request);
          await write(src, dest, request);
          if (!silent) {
            notifier.notify({
              title: 'File Uploaded',
              message: dest
            });
          }
          if (spinner) {
            spinner.text = `${src} pushed to ${dest}`;
            spinner.succeed();
          }
        } catch (err) {
          if (spinner) {
            spinner.text = err.message;
            spinner.fail();
          }
        }

        if (spinner) {
          spinner.text = text;
          spinner.start();
        }
        uploading.delete(src);
      }
    };

    function findException(path) {
      return gulp_exceptions.find(item => {
        return path.includes(item.exception);
      });
    };

    function checkExceptions(file, callback) {
      let exception = findException(file);
      if (exception) {
        // Execute command to recompile assets
        exec(`(cd gulp_builder && ${exception.command})`, (error, stdout, stderr) => {});        
      } else {
        callback(file);
      }
    }

    watcher.on('change', (file) => checkExceptions(file, upload));
    watcher.on('add', (file) => checkExceptions(file, upload));
  } catch (err) {
    log.error(err);
  }
};
