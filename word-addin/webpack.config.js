/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");

module.exports = async (_env, options) => {
  const isDev = options.mode !== "production";

  let httpsOptions = true; // webpack-dev-server built-in self-signed fallback
  if (isDev && process.env.MIKE_USE_OFFICE_CERTS !== "false") {
    try {
      const devCerts = require("office-addin-dev-certs");
      httpsOptions = await devCerts.getHttpsServerOptions();
    } catch {
      console.warn(
        "[mike-addin] office-addin-dev-certs not installed or certs missing.",
        "Run `npm run install-certs` once, then restart the dev server.",
      );
    }
  }

  return {
    entry: {
      taskpane: "./src/taskpane/index.tsx",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].bundle.js",
      clean: true,
      // Relative paths keep the bundle portable across development and
      // production mount points.
      publicPath: "",
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js", ".jsx"],
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx|js|jsx)$/,
          use: "babel-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
          type: "asset/resource",
          generator: { filename: "assets/[name][ext]" },
        },
      ],
    },
    plugins: [
      new Dotenv({ path: "./.env", safe: false, silent: true }),
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/index.html",
        chunks: ["taskpane"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "manifest.xml", to: "manifest.xml" },
          {
            from: "assets",
            to: "assets",
            noErrorOnMissing: true,
            globOptions: { ignore: ["**/icon.png"] },
          },
        ],
      }),
    ],
    devServer: {
      port: 3002,
      server:
        httpsOptions === true
          ? "https"
          : { type: "https", options: httpsOptions },
      static: { directory: path.join(__dirname, "dist") },
      proxy: [
        {
          context: ["/api"],
          target: process.env.MIKE_BACKEND_URL || "http://127.0.0.1:3001",
          pathRewrite: { "^/api": "" },
          changeOrigin: true,
        },
      ],
      hot: true,
      compress: true,
    },
    devtool: isDev ? "source-map" : false,
    mode: options.mode,
  };
};
