// utils/helpers.js
const { networkInterfaces } = require('os');

exports.getAllIPs = () => {
  const nets = networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({
          interface: name,
          address: net.address,
          family: net.family
        });
      }
    }
  }
  return ips;
};

exports.logRequest = (req, res, next) => {
  console.log(`📍 ${new Date().toLocaleTimeString()} - ${req.method} ${req.originalUrl}`);
  console.log(`   From: ${req.ip} | Origin: ${req.headers.origin || 'No Origin'}`);
  next();
};

exports.displayServerInfo = () => {
  const ips = exports.getAllIPs();
  const PORT = process.env.PORT || 5000;
  
  console.log(`\n📍 Port: ${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database: Connected ✅`);
  
  console.log('\n🌐 ACCESSIBLE URLs:');
  console.log('─'.repeat(40));
  
  console.log('💻 LOCAL:');
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://127.0.0.1:${PORT}`);
  
  console.log('\n📡 NETWORK:');
  ips.forEach(ip => {
    console.log(`   http://${ip.address}:${PORT} (${ip.interface})`);
  });
  
  console.log('\n📱 MOBILE:');
  console.log(`   Android: http://10.0.2.2:${PORT}`);
  console.log(`   Genymotion: http://10.0.3.2:${PORT}`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Server ready!');
  console.log('='.repeat(50) + '\n');
};