const usb = require('usb');

function main(){
  const devices = usb.getDeviceList();
  console.log(devices);
}


main();
