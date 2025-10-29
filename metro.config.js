const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add `.geojson` to the list of asset extensions accepted by Metro bundler
config.resolver.assetExts.push('geojson');

module.exports = config;
