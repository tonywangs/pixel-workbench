import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'browser.spec.js',workers:1,timeout:90000,use:{baseURL:'http://127.0.0.1:4318',headless:true},webServer:{command:'node server.js',env:{PORT:'4318'},url:'http://127.0.0.1:4318',reuseExistingServer:false}});
