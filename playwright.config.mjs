import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:30000,expect:{timeout:10000},workers:1,
  globalTimeout:300000,retries:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:8765',viewport:{width:1440,height:1000},
    screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:{command:'python3 -m http.server 8765 --bind 127.0.0.1',url:'http://127.0.0.1:8765',timeout:10000,reuseExistingServer:!process.env.CI}
});
