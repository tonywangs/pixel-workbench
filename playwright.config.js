const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests',testMatch:'*.spec.js',timeout:180000,workers:1,use:{baseURL:'http://127.0.0.1:4174',headless:true},webServer:{command:'node server.js',url:'http://127.0.0.1:4174',env:{PORT:'4174',DESK_WORK:'.work/browser-tests'},reuseExistingServer:false},reporter:'list'});
