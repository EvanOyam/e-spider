/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build:main`, this file is compiled to
 * `./src/main.prod.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import pie from 'puppeteer-in-electron';
import puppeteer from 'puppeteer-core';
import log from 'electron-log';
import fs from 'fs';
import stringify from 'csv-stringify';
import moment from 'moment';
import MenuBuilder from './menu';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// 数据
let spiderRawData: string[] = [];

// 展开全文
const openUnfold = async (eleList: HTMLElement[]) => {
  // BUG: 解决网络异常弹窗的问题
  const asyncClick = (ele: HTMLElement) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        ele.click();
        resolve(ele);
      }, 200);
    });
  };

  for (const ele of eleList) {
    await asyncClick(ele);
  }

  return eleList;
};

// 记录日志
const customLog = (mainWindow: BrowserWindow | null, msg: string[]) => {
  mainWindow?.webContents.send('customLog', msg);
};

// 登录
const login = async (
  browser: any,
  mainWindow: BrowserWindow | null,
  cookiesPath: string
) => {
  const url = 'https://www.weibo.com';
  const weiboWin = new BrowserWindow({
    width: 1200,
    height: 960,
    title: '登录',
  });
  await weiboWin.loadURL(url);
  const page = await pie.getPage(browser, weiboWin);
  await page.waitForSelector('.gn_name', {
    timeout: 3600 * 1000,
  });

  try {
    customLog(mainWindow, ['尝试获取并写入 cookie']);
    const cookies = await page.cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    page.close();
    customLog(mainWindow, ['写入 cookie 成功']);
  } catch (error) {
    page.close();
    customLog(mainWindow, ['获取 cookie 失败', error.message]);
    throw new Error('获取 cookie 失败');
  }
};

// 获取文本
const getText = async (
  page: any,
  mainWindow: BrowserWindow | null,
  id: string,
  p: number
) => {
  try {
    // 跳转到目标地址
    const url = `https://www.weibo.com/${id}?is_search=0&visible=0&is_all=1&is_tag=0&profile_ftype=1&page=${p}#feedtop`;
    await page.goto(url);

    // 滚动页面直到获取到 nextPage btn
    page.evaluate(() => {
      let totalHeight = 0;
      const distance = 200;
      const timer = setInterval(() => {
        const { scrollHeight } = document.body;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          const nextBtn = document.querySelector(
            `a[suda-uatrack="key=tblog_profile_v6&value=weibo_page"]`
          );
          if (nextBtn) {
            clearInterval(timer);
          } else {
            document.body.scrollTop = 0;
          }
        }
      }, 100);
    });

    await page.waitForSelector(
      `a[suda-uatrack="key=tblog_profile_v6&value=weibo_page"]`,
      {
        timeout: 3600 * 1000,
      }
    );
  } catch (error) {
    customLog(mainWindow, ['初始化目标地址失败', error.message]);
  }

  try {
    // 点击展开全文
    const foldBtnList = await page.$$(`a[action-type="fl_unfold"]`);
    await openUnfold(foldBtnList);
  } catch (error) {
    customLog(mainWindow, ['展开全文异常', error.message]);
  }

  try {
    // 爬取普通数据
    const text = await page.$$eval(
      `div[node-type="feed_list_content"]`,
      (node: any) =>
        node.map((t: any) => {
          const res: string = t.innerHTML.replace(/<.*?>/g, '').trim();
          return res.endsWith('...展开全文c') ? '' : res;
        })
    );

    // 爬取展开全文数据
    const textFull = await page.$$eval(
      `div[node-type="feed_list_content_full"]`,
      (node: any) =>
        node.map((t: any) => {
          const res = t.innerHTML.replace(/<.*?>/g, '').trim();
          return res;
        })
    );

    return [...text, ...textFull];
  } catch (error) {
    customLog(mainWindow, ['爬取数据失败', error.message]);
    throw new Error(`爬取数据失败: ${error.message}`);
  }
};

const startSpider = async (
  page: any,
  mainWindow: any,
  id: string,
  p: number,
  startIdx: number
) => {
  // 开始爬数据
  let i = startIdx;
  try {
    while (i <= p) {
      customLog(mainWindow, [`正在爬取第 ${i} 页数据，共 ${p} 页`]);
      const res = await getText(page, mainWindow, id, i);
      spiderRawData = [...spiderRawData, ...res];
      i += 1;
    }
    page.close();
    customLog(mainWindow, [`爬取数据完成`]);
  } catch (error) {
    if (error.indexOf('Target closed') !== -1) {
      customLog(mainWindow, [`爬虫进程异常关闭`, error.message]);
    } else {
      customLog(mainWindow, [`爬虫在第 ${i} 页异常`, error.message]);
      startSpider(page, mainWindow, id, p, i);
    }
  }
};

const main = async () => {
  await pie.initialize(app);
  const browser = await pie.connect(app, puppeteer);

  let mainWindow: BrowserWindow | null = null;

  if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
  }

  if (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true'
  ) {
    require('electron-debug')();
  }

  const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
      .default(
        extensions.map((name) => installer[name]),
        forceDownload
      )
      .catch(console.log);
  };

  const createWindow = async () => {
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
    ) {
      await installExtensions();
    }

    const RESOURCES_PATH = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, '../assets');

    const getAssetPath = (...paths: string[]): string => {
      return path.join(RESOURCES_PATH, ...paths);
    };

    const cookiesPath = getAssetPath('cookies.json');
    const isExistCookies = fs.existsSync(cookiesPath);
    if (isExistCookies) fs.unlinkSync(cookiesPath);

    mainWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 728,
      minWidth: 1024,
      minHeight: 728,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true,
      },
    });

    ipcMain.handle('login', async (event) => {
      try {
        await login(browser, mainWindow, cookiesPath);
        customLog(mainWindow, ['登录成功']);
      } catch (error) {
        customLog(mainWindow, ['登录失败', error.message]);
      }
    });

    ipcMain.handle('checkLink', async (event, url) => {
      try {
        const userWin = new BrowserWindow({
          width: 1200,
          height: 960,
          title: '检查链接',
        });
        await userWin.loadURL(url);
      } catch (error) {
        customLog(mainWindow, ['检查链接失败', error]);
      }
    });

    ipcMain.handle('spider', async (event, id, p) => {
      // 初始化
      spiderRawData = [];

      // 获取 cookies
      let cookies;
      try {
        customLog(mainWindow, ['尝试读取 cookie']);
        const cookiesString = fs.readFileSync(cookiesPath).toString();
        cookies = JSON.parse(cookiesString);
        customLog(mainWindow, ['读取 cookie 成功']);
      } catch (error) {
        customLog(mainWindow, ['读取 cookie 失败', error.message]);
      }

      // 获取 puppeteer 实例
      let page;
      try {
        const userWin = new BrowserWindow({
          width: 1200,
          height: 960,
          title: 'Spider',
        });
        page = await pie.getPage(browser, userWin);
        await page.setCookie(...cookies);
        customLog(mainWindow, ['爬虫启动成功']);
      } catch (error) {
        customLog(mainWindow, ['爬虫启动失败', error.message]);
      }

      // 开始爬虫
      startSpider(page, mainWindow, id, p, 1);
      page?.on('close', () => {
        // 通知渲染进程正在处理数据
        mainWindow?.webContents.send('finished', 1);
        const csvDir = getAssetPath('csv');
        const hasDir = fs.existsSync(csvDir);
        if (!hasDir) fs.mkdirSync(csvDir, { recursive: true });
        const csvPath = getAssetPath(
          `csv/${id}__${moment().format('YYYY_MM_DD_HH_mm_ss')}.csv`
        );
        spiderRawData = [...new Set(spiderRawData)].filter((str) => str);
        const spiderData = spiderRawData.map((t) => {
          return {
            内容: t,
          };
        });
        stringify(
          spiderData,
          {
            header: true,
          },
          function (err, output) {
            if (err) {
              customLog(mainWindow, ['保存数据失败', err.message]);
            } else {
              // 过滤完成清空数据释放内存，通知渲染进程支持导出 csv
              fs.writeFileSync(csvPath, '\ufeff');
              fs.appendFileSync(csvPath, output);
              spiderRawData = [];
              mainWindow?.webContents.send('finished', 2, csvPath);
            }
          }
        );
      });
    });

    ipcMain.handle('export', async (event, basePath) => {
      try {
        const { dialog } = require('electron');
        const savePath = dialog.showSaveDialogSync(mainWindow, {
          defaultPath: 'spider.csv',
        });
        fs.copyFileSync(basePath, savePath);
        customLog(mainWindow, ['保存成功']);
      } catch (error) {
        customLog(mainWindow, ['保存失败', error.message]);
      }
    });

    mainWindow.loadURL(`file://${__dirname}/index.html`);

    // @TODO: Use 'ready-to-show' event
    //        https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
    mainWindow.webContents.on('did-finish-load', () => {
      if (!mainWindow) {
        throw new Error('"mainWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        mainWindow.minimize();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    mainWindow.webContents.on('new-window', (event, url) => {
      event.preventDefault();
      shell.openExternal(url);
    });

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    new AppUpdater();
  };

  /**
   * Add event listeners...
   */

  app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.whenReady().then(createWindow).catch(console.log);

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) createWindow();
  });
};

main();
