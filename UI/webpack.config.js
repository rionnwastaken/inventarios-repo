import path from "path";
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  // 1. Your entry point
  entry: "./src/js/main.ts",

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        oneOf: [
          // 1. Inline raw source string when import/require ends with ?raw or ?source
          {
            resourceQuery: /raw|source/,
            type: "asset/source",
          },
          // 2. Default: emit as file URL path
          {
            type: "asset/resource",
            generator: {
              filename: "assets/icons/[name][ext]",
            },
          },
        ],
      },
    ],
  },

  // 3. Resolve extensions
  resolve: {
    extensions: [".ts", ".js"],
  },

  // 4. Output configuration
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "static"),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/html/index.html", // Source HTML template
      filename: "./html/index.html", // Output name in the /static directory
    }),
  ],

  mode: "development",
};
