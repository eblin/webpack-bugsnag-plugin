import path from 'path';
import CommonBugsnagPlugin from './helpers/CommonBugsnagPlugin';
import { upload } from 'bugsnag-sourcemap';

class BugsnagSourceMapPlugin extends CommonBugsnagPlugin {
  constructor({
    apiKey = null,
    publicPath = null,
    appVersion = null,
    override = false,
  }) {
    super();
    this.options = {
      apiKey,
      publicPath,
      appVersion,
      override,
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
      const [ file ] = chunk.files.filter(file => /\.js$/.test(file));
      const [ sourceMap ] = chunk.files.filter(file => /\.js\.map$/.test(file));

      if (sourceMap) {
        sourceMaps.push({
          url: publicPath + file,
          file: path.resolve(outputPath, file),
          sourceMap: path.resolve(outputPath, sourceMap),
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
    const { apiKey, appVersion, override } = this.options;
    const uploadOptions = { apiKey, appVersion, override };
    if (appVersion) {
      return Promise.resolve(uploadOptions);
    } else {
      return this.getProjectDetails(compilation).then(details => {
        uploadOptions.appVersion = details.version;
        return uploadOptions;
      });
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
