module.exports = {
  apps: [
    {
      name: 'uiai',
      script: 'npm',
      args: 'start',
      cwd: '/home/ubuntu/UIAIv2.0',
      env: {
        NODE_ENV: 'production',
        PORT: 8082,
      },
    },
  ],
};
