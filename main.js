const usb = require('usb');

const vid = 0x10c4;
const pid = 0xea60;

function main(){
  const devices = usb.getDeviceList();
  console.log(devices);

  const device = devices.find(d => d.deviceDescriptor.idVendor === vid && d.deviceDescriptor.idProduct === pid);
  console.log(device);

  if(device){
    console.log('Device found');
  }
}


main();
