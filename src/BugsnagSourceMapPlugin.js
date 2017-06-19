import path from 'path';
import CommonBugsnagPlugin from './helpers/CommonBugsnagPlugin';
import { upload } from 'bugsnag-sourcemaps';

class BugsnagSourceMapPlugin extends CommonBugsnagPlugin {
  constructor({
    apiKey = null,
    publicPath = null,
    appVersion = null,
    overwrite = false,
    endpoint = 'https://upload.bugsnag.com',
  }) {
    super();
    this.options = {
      apiKey,
      publicPath,
      appVersion,
      overwrite,
      endpoint,
    };
    this.validateOptions();
  }

  apply(compiler) {
    compiler.plugin('after-emit', this.handle.bind(this));
  }

  getSourceMaps(compilation) {
    const sourceMaps = [];

    const stats = compilation.getStats().toJson();
    const outputPath = path.resolve(
      compilation.compiler.options.context,
      compilation.compiler.options.output.path
    );
    let publicPath = this.options.publicPath || stats.publicPath;
    publicPath += /\/$/.test(publicPath) ? '' : '/';

    stats.chunks.forEach(chunk => {
      let [ file ] = chunk.files.filter(file => /\.js$/.test(file));
      const [ sourceMap ] = chunk.files.filter(file => /\.js\.map$/.test(file));

      // remove slashes just in case our bundles are something like /js/blahblah.js
      file = file.replace(/^\/+/g, '');

      if (sourceMap) {
        sourceMaps.push({
          url: publicPath + file,
          file: path.join(outputPath, file),
          sourceMap: path.join(outputPath, sourceMap),
        });
      }
    });

    return sourceMaps;
  }

  uploadSourceMaps(options, sourceMaps) {
    return Promise.all(
      sourceMaps.map(({ url, file, sourceMap }) => (
        upload({
          ...options,
          minifiedUrl: url,
          minifiedFile: file,
          sourceMap: sourceMap,
        })
      ))
    );
  }

  getUploadOptions(compilation) {
    const { apiKey, appVersion, overwrite, endpoint } = this.options;
    const uploadOptions = { apiKey, appVersion, overwrite, endpoint };
    if (appVersion) {
      return Promise.resolve(uploadOptions);
    } else {
      // do not include an appVersion if not desired
        delete uploadOptions.appVersion;
        return Promise.resolve(uploadOptions);
        // TODO: fix this magic OR remove it completely, git remote get-url crashing on server
      // return this.getProjectDetails(compilation).then(details => {
      //   uploadOptions.appVersion = details.version;
      //   return uploadOptions;
      // });
    }
  }

  handle(compilation, callback) {
    const sourceMaps = this.getSourceMaps(compilation);
    this.getUploadOptions(compilation)
      .then(options => this.uploadSourceMaps(options, sourceMaps))
      .catch(this.handleErrors(compilation, callback))
      .then(() => callback());
  }
}

export default BugsnagSourceMapPlugin;
