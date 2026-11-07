const {app,BrowserWindow,shell}=require('electron');
const path=require('path');
function create(){
  const w=new BrowserWindow({width:480,height:820,autoHideMenuBar:true,title:'FreeGram',icon:path.join(__dirname,'icon.png')});
  w.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return {action:'deny'}});
  w.loadFile(path.join(__dirname,'www','index.html'));
}
app.whenReady().then(create);
app.on('window-all-closed',()=>app.quit());
