const path = require('path');

module.exports = {
  mode: "development",
  entry: "./src/example.ts",
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: "main.js"
  },
  resolve: {
    // Add '.ts' and '.tsx' as a resolvable extension.
    extensions: [".ts", ".tsx", ".js"]
  },
  module: {
    rules: [
      // all files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'
      {
        test: /\.tsx?$/,
        use: "ts-loader"
      }
    ]
  }
}
