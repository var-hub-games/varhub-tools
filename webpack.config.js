const path = require('path');

module.exports = (env) => {
    if (!env) env = {};
    const PRODUCTION = env.production === undefined ? false : env.production;

    return {
        devtool: 'source-map',
        mode: PRODUCTION ? 'production' : 'development',
        entry: {
            index: './src/index.ts',
        },
        output: {
            path: path.join(__dirname, 'dist'),
            filename: 'index.js',
            library: {
                name: 'VarHub',
                type: 'umd2',
                export: 'default',
            },
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        module: {
            rules: [
                // Правило для .ts .tsx
                {
                    test: /\.tsx?$/,
                    loader: 'ts-loader',
                    exclude: /node_modules/,
                },
            ]
        },
    };
};