module.exports = {
  apps: [
    {
      name: 'uiai',
      script: '/home/ubuntu/UIAIv2.0/dist/server.cjs',
      cwd: '/home/ubuntu/UIAIv2.0',
      max_restarts: 5,
      restart_delay: 10000,
      min_uptime: 15000,
      env: {
        NODE_ENV: 'production',
        PORT: 8082,
      },
    },
  ],
};
