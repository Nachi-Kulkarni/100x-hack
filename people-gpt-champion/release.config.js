module.exports = {
  branches: [
    'main', // Default release branch
    { name: 'develop', prerelease: true }, // Example prerelease branch
    { name: 'beta', prerelease: true }, // Another example prerelease branch
  ],
  plugins: [
    '@semantic-release/commit-analyzer', // Analyzes commit messages
    '@semantic-release/release-notes-generator', // Generates release notes
    [
      '@semantic-release/changelog', // Updates CHANGELOG.md
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/npm', // If you were publishing to npm (optional, can be removed if not)
                              // This updates package.json version. Keep it for now.
      {
        npmPublish: false, // Set to true if you want to publish to npm
        // tarballDir: 'dist', // Optional: if you want to pack the tarball
      },
    ],
    [
      '@semantic-release/github', // Creates GitHub releases, comments on issues/PRs
      {
        // assets: 'dist/*.tgz', // Optional: if you have assets to upload (like tarball from npm step)
      },
    ],
    [
      '@semantic-release/git', // Commits package.json and CHANGELOG.md back to the repo
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};
