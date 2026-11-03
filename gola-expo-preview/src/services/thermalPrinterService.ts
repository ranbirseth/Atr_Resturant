import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  connectDevice,
  EscPos,
  getConnectedDevice,
  getPairedDevices,
  isBluetoothEnabled,
  printRaw,
  requestEnableBluetooth,
  type BluetoothDevice,
} from 'rn-bluetooth-classic-printer';
import { PermissionsAndroid, Platform } from 'react-native';

const PRINTER_ADDRESS_KEY = '@printer_mac_address';
const RECEIPT_WIDTH = 32;
// GS v 0 raster data from assets/payment-qr.png, resized to the 384-dot 58mm width.
const PAYMENT_QR_RASTER_COMMAND = 'HXYwADAAjQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgPwDgeHAHgB/AeDh4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf4f4HweHAPwB/gfDx4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf4/8H4fHAf4B/w/BxwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA998+H4fnAd4Bzw/B7wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA898eH4fnge4Bx4/h7wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/B4OP4f3AOABx57g/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfx4AO8f3A/AB/57g/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP54Aecd/B/gB/x7wfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH94cfec/B7wB/j/weAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAw94ef+e/BzwBwD/wOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA888+f+cfB74BwD/4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf8/8+PePB/8BwHh4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf8f88PePg/cBwHg4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4P44HeHAeOBwDA4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQgAuv//wAALP////gD/AH/AP/////////4AAAAf/////////wAAf//////4B/wAAf8A////4AAP/////gH/gH/AP/////////8AAAAf/////////4AAf//////4B/wAAf8A////4AAP/////gH/gH/AP/////////8AAAAf/////////4AAf//////4B/wAAf8A////4AAP/////gH/gH/AP/////////8AAAAf/////////4AAf//////4B/wAAf8A////4AAP/////gH/gH/AP/////////8AAAAf/////////4AAf//////4B/4AAf8A////4AAP/////gH/gH/AP/////////8AAAAf/////////4AAf//////4B/wAAf8A////4AAP/////gH/gH/AP/////////4AAAAf/////////4AAf//////4B/wAAf+A////4AAP/////gH/gH/AP/////////8AAAAf/////////4AAf//////4B/wAAf+A////4AAP/////gH/gH/AP/////////4AAAAf/////////4AAf//////8B/wAAf+A////4AAP/////13/gH/AP/////////4AAAAf/////////4B///////////wD////////4B//////////gBQAP/AAAAAAA/4AAAAf/////////4D/wH//8R///AAD/wH/gAA/4B//////////gAAAP+AAAAAAA/4AAAAf+AAAAAAB/4D/wD//8A///AAD/wD/gAA/4B//////////gAAAP+AAAAAAA/4AAAAf+AAAAAAB/4D/wD//8A///AAD/wD/gAA/4B//////////gAAAP+AAAAAAA/4AAAAf+AAAAAAB/4D/wD//8A///AAD/wD/gAA/4B//////////gAAAP+AAAAAAA/4AAAAf+AAAAAAB/4B/wD//8A///AAD/wD/gAA/4B//////////gAAAP+AAAAAAA/4AAAAf+AAAAAAB/4B/wD//8A///AAD/wD/gAA/4B//////////gAAAP+AAAAAAA/4AAAAf+AAAAAAB/4B/wD//8A///AAD/wD/gAA/4B//////////gAAAP+AAAAAAA/4AAAAf+AAAAAAB/4B/wD//8A///AAD/wD/gAA/4B//////////34AAP+Af///4A/4AAAAf+Af///4B/4B/wD//8A///////wD/gH//4B///////////4AAP+Af///8A/4AAAAf+Af///8B/4A/wD//sAAND//+AAAAAH//4AAAAAAH/gH//4AAf+Af///8A/4AAAAf+Af///8B/4AAAD/wAAAAB//+AAAAAH//4AAAAAAH/gH//4AAP+Af///8A/4AAAAf+Af///8B/4AAAD/wAAAAB//+AAAAAH//4AAAAAAH/gH//4AAP+Af///8A/4AAAAf+Af///8B/4AAAD/wAAAAB//+AAAAAH//4AAAAAAH/gH//4AAf+Af///8A/4AAAAf+Af///8B/4AAAD/wAAAAB//+AAAAAH//4AAAAAAH/gH//4AAf+Af///8A/4AAAAf+Af///8B/4AAAD/wAAAAB//+AAAAAH//4AAAAAAH/gH//4AAf+Af///8A/4AAAAP+Af///8B/4AAAD/wAAAAB//+AAAAAH//4AAAAAAH/gH//4AAf+Af///8A/4AAAAP+Af///8B/4AAAD/wAAAAB///AAAAAH//4AAAAAAH/gP//4AAf+Af///8B/4AAAAP+Af///8B/4AAAD//8AAP/////gD/gH//4AAP+AAD/////gAAf+Af///8B/4AAAAP+Af///8B/4AAAD//8AAP/AAD/wD/gH//4AAP+AAAA/4AAAAAf+Af///8B/4AAAAP+Af///8B/4AAAD//8AAP/AAD/wD/gH//4AAP+AAAA/4AAAAAf+Af///8B/4AAAAP/Af///8B/4AAAD//8AAH/AAD/wD/gH//4AAP+AAAA/4AAAAAf+Af///8B/4AAAAP/Af///8B/4AAAD//8AAH/AAD/wD/gH//4AAP+AAAA/4AAAAAf+Af///4B/4AAAAP/Af///8B/4AAAD//8AAH/AAD/wD/gH//4AAP+AAAA/4AAAAAf+Af///4B/4AAAAP/Af///8B/8AAAD//8AAH/AAD/wD/gH//4AAP+AAAA/4AAAAAf+Af///4B/4AAAAP/Af///8B/4AAAD//8AAH/AAD/wD/gH//4AAP+AAAA/4AAAAAf+Af///4B/wAAAAP/Af///8B/4AAAD//+AAP/AAD/wD/gH//4AAf+OAAH/9//f+Af+Af///4B/wAAAAP/Af///8A/8B///////gP/////wD/gH////////gH//////+Af+Af///4B/wAAAAP/Af///8A/4B///////gP////AAAAAH/////wD/wH//////+Af+Af///4B/wAAAAP/Af///8A/8B//+AAH/gH///+AAAAAH/////wD/gH//////+Af+Af///4B/wAAAAP/Af///8A/8B//+AAH/gH///+AAAAAH/////wD/gH//////+Af+Af///4H/wAAAAP/Af///8A/8B//+AAH/gH///+AAAAAH/////wD/gH//////+Af+A////4H/wAAAAP/Af///+A/8B//+AAH/gH///+AAAAAH/////wD/gH//////+Af+A////4P/wAAAAP/Af///+A/8B//+AAH/gH///+AAAAAH/////wD/gH//////+Af+A////4P/wAAAAP/Af///+A/8B//+AAH/gH////AAAAAH/////wD/wH//////+Af+A////4H/wAAAAP/Af///+A/8B//+AAD/wP///+AAAAAH/////77/////////+Af+Af///4H/wAAAAP/AP///+A/8B//+AAD//////+AAAAAH/////////////f4NuAf+AAAAAAD/wAAAAH/AD97AWA/8Awf+AAD//8AAAAAAAAAAB/4B//+Af8A/4AAAAAf+AAAAAAB/wAAAAP/AAAAAAA/8AAP+AAD//8AAAAAAAAAAA/4B//+Af8A/4AAAAAf+AAAAAAB/wAAAAP/AAAAAAA/8AAP+AAD//8AAAAAAAAAAA/4B//+Af8A/4AAAAAf+AAAAAAB/wAAAAP/AAAAAAA/8AAP+AAD//8AAAAAAAAAAA/4B//+Af8A/4AAAAAf+AAAAAAB/wAAAAP/AAAAAAA/8AAP+AAD//8AAAAAAAAAAA/4B//+Af8A/4AAAAAf8AAAAAAB/wAAAAH/AAAAAAA/8AAP+AAD//8AAAAAAAAAAA/4B//+Af8A/4AAAAAf8AAAAAAB/wAAAAH/AAAAAAA/8AAP+AAD//8AAAAAAAAAAA/4B//+Af8A/4AAAAAf+AAAAAAB/wAAAAH/gAAAACE/8AAP/AAD//8AAAAAAAAAAB/4B//+v/+///+AP+Af/////////wAAAAH/////////8B////wD////AP+Af8A/8A/4B/+H/yP/wf/Af+Af/////////wAAAAH/////////8B/8j/wD/gP/AP+Af8A/8A/4B/wD/gH/AP/Af+Af/////////wAAAAP/////////8B/4D/wD/gH/AP+Af+A/8A/4B/wD/gH/AP/AP+Af/////////wAAAAH/////////8B/4D/wD/gH/AP/Af+A/8A/4B/wD/gH/AP/Af+Af/////////wAAAAH/////////8B/4D/wD/gH/AP/Af+A/8A/4B/wD/gH/AP+Af+Af/////////wAAAAH/////////8B/4D/wD/gH/AP/Af+A/8A/4B/wD/gH/AP+Af+Af/////////wAAAAH/////////8B/4D/wD/gH/AP/Af+A/8A/4B/wD/gH/AP+Af+Af/////////wAAAAH/////////8A/4D/wD/gH/AP/Af+A/8A/4B/wD/gH/AP/Af+Af/////////wAAAAH/////////8A/8f/4T/8H/AP/8f///+e/4B/wD/gH///+Af+Af//////v71gAAAAH/////////8A//////////AP/////////4B/wD/gH///+Af+AAAAAAAAAAAAAAAAAgAAAAA4HDMAAP/Af+A///AAD/wD////AAB/wAAAH///+Af+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Af+A///AAD/wD////AAB/wAAAH///+Af+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Af+A///AAB/wD////AAB/wAAAH///+Af+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Af+A///AAD/wD////AAB/wAAAH///+Af+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Af+A///AAD/wD////AAB/wAAAH///+Af+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Af+A///AAD/wD////AAB/wAAAH///+Af+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Af+A///AAD/wD////AAB/wAAAH////Af+AAAAQQAALcAAAAAAHOAH8ADwAf4AAP/lf+A///jwB/wD////vwB/wAA////////+AAAB/4AAP+AAAAAAH/gP/Af+Af8AAH///+A////4B/wD/////4B/wAA///////wAAAAA/4AAf+AAAAAAH/gH/Af+Af8AAAj/5gA/8B/4AAAD/gH//4AAAAA///////wAAAAB/4AAf+AAAAAAH/gH/Af+Af8AAAB/4AA/8A/4AAAD/gH//4AAAAA///////wAAAAB/4AAf+AAAAAAH/gH/AP+Af8AAAB/4AA/8A/4AAAD/gH//4AAAAA///////wAAAAB/4AAf+AAAAAAH/gH/AP+Af+AAAB/4AA/8A/4AAAD/gH//4AAAAA///////wAAAAB/4AAf+AAAAAAH/gP/AP+Af8AAAB/4AA/8A/4AAAD/gH//4AAAAA///////wAAAAB/4AAf+AAAAAAH/gH/AP+Af8AAAB/4AA/8A/4AAAD/gH//4AAAAA///////wAAAAB/4AAf+AAAAAAH/wH/AP+Af+AAAB/4AA/8A/4AAAD/gH//4AAAAA///////wAAAAB/4AAf+AAAAAAD/////v/Af///4B////f8A//+AP//gH//4B/wAA///////////8A/AAAf+AAAAAAD//////+Af///8A/////8A///Af//gD//4D/wAABSMAf+Af///8AAAAAf8AAAAAAAA/8B/4AAAH//8AAP//wAAAP/Af//gAB/4D/wAAAAAAP+Af///8AAAAAf8AAAAAAAA/8B/4AAAH//8AAP//wAAAP/Af//gAB/4D/wAAAAAAP+Af///4AAAAAf8AAAAAAAA/8B/4AAAH//8AAP//wAAAP/Af//gAB/4D/wAAAAAAP+Af///4AAAAAf8AAAAAAAA/8B/4AAAH//8AAP//wAAAP/Af//gAA/4D/wAAAAAAP+Af///4AAAAAf8AAAAAAAA/8B/4AAAH//8AAP//wAAAP/Af//gAA/4D/wAAAAAAP+Af///4AAAAAf8AAAAAAAA/8B/4AAAH//8AAP//wAAAP/Af//gAB/4B/wAAAAAAP+Af///4AAAAAf8AAAAAAAA/8B/4AAAH//8AAP//wAAAP/Af//wAA/4D/wAAAAAAP+Af///4B/0/////gAAAAAA/8B//+Af/////////+8AAP/Af//////4B/wAAAAAAP+Af///4B///////gAAAAAAf8B///Af//////////8AAP/AP3/////4AAAAAAAAAAAAAH/gAB///////gAAAAAA/8A///Af+AAP//4D//8AAP/AAD/////4AAAAAAAAAAAAAH/gAB///////gAAAAAAf8A///Af+AAH//4D//8AAP/AAD/////4AAAAAAAAAAAAAH/gAB///////gAAAAAAf8A///Af+AAH//4D//8AAP/AAD/////4AAAAAAAAAAAAAH/gAB///////gAAAAAA/8A///Af+AAH//4D//8AAP/AAD/////4AAAAAAAAAAAAAH/gAB///////gAAAAAA/8A///Af+AAP//4D//8AAP/AAD/////4AAAAAAAAAAAAAH/gAB///////gAAAAAA/8A///Af+AAH//4D//8AAP/AAD/////4AAAAAAAAAAAAAH/gAB///////gAAAAAAf8A///Af+AAH//4D//+AAP/AAD/////4AAAAAAAAAAAAAH/gAB///////gAAAAAAf8A///////////4D////AP/////////4D/wAA///Af//gH/gAB/wAA/8AAAAAAAAP8AH//////////wD/5P/gD////w/8bkAD/wAA///Af//gH/gAB/wAAf8AAAAAAAAAAAAP//wD//8AAAD/wH/gAB//+A/8AAAD/wAA///Af//gH/gAB/wAAf8AAAAAAAAAAAAP//4D//8AAAD/wH/gAB//+A/8AAAD/wAA///Af//gH/gAB/wAAf8AAAAAAAAAAAAP//4D//8AAAD/wH/gAB//+A/8AAAD/wAA///Af//gH/gAB/wAAf8AAAAAAAAAAAAP//4D//8AAAD/wH/gAB//+A/8AAAD/wAA///Af//gH/gAB/wAAf8AAAAAAAAAAAAP//4D//8AAAD/wD/gAB//+A/8AAAD/wAA///Af//gH/gAB/wAA/8AAAAAAAAAAAAP//4D//8AAAD/wD/gAB//+A/8AAAD/wAA///Af//gH/gAB/wAA/8AAAAAAB/gAAAP//////8AAP//4H/xAB//+A/8AAAD//1///+Af//////////+Af4AAAAAAB/wAAAP//////8AAP//////4B//+A/8AAAD///////AP3+/85/////+AAAAAAAAAB/wAAAP/Af///8AAP+Af///4B//+A/8AAAD///////AAAA/8B/////8AAAAAAAAAB/wAAAP/Af///8AAP+Af///4B//+A/8AAAD///////AAAA/8B/////8AAAAAAAAAB/wAAAP/AP///8AAP+Af///4B//+A/8AAAD//////+AAAA/8B/////8AAAAAAAAAB/wAAAP/AP///8AAP+Af///4B//+A/8AAAD///////AAAA/8B/////8AAAAAAAAAB/wAAAP/AP///8AAP/Af///4B//+A/8AAAD//////+AAAA/8B/////8AAAAAAAAAB/wAAAH/AP///8AAP/Af///4B//+A/8AAAD//////+AAAA/4B/////8AAAAAAAAAB/wAAAH/AP///8AAP/Af///8B//+A/8AAAD///////AAAA/8B/////8AgAAAAAAAB//8Aff/AP///8AAP/xf///8B///+//+AP/////////gAAf///////8A/4AAAAAAB//+A///AP///8AAP//////8A///////AP/82AMAv//wAAAP/////wAA/4AAAAAAB//+A///AAAAAAAAP//wAA/8AAAD////AP+AAAAAP//wAAAH/////wAA/4AAAAAAB//+A///AAAAAAAAP//wAA/8AAAD////AP+AAAAAP//wAAAH/////wAA/4AAAAAAB//+A///AAAAAAAAP//wAA/8AAAD////AP+AAAAAP//wAAAH/////wAA/4AAAAAAB//+A///AAAAAAAAP//wAA/8AAAD////AP+AAAAAP//wAAAH/////gAA/4AAAAAAB//+A///AAAAAAAAP//wAA/8AAAD////AP+AAAAAP//wAAAH/////gAA/4AAAAAAB//+Af//gAAAAAAAP//wAA/8AAAD////AP+AAAAAP//wAAAH/////gAA/4AAAAAAB//+Af//gAAAAAAAP//wAA/8AAAD////AP+AAAAAP//wAAAH/////gG3//+AAAAAA//+Af//gP+Af8AAP///8A/4B/wD////AP//gH/AP//gD////v7+cAH/gP/AAAAAA//+AP//gP/Af8AAP///+AX4B/wD////AOD/wH/AP+AAD////AAAAAH/gP+AAAAAAAP+AAH/gP/Af8AAP///+AAAB/wD////AAD/wH/AP+AAD////AAAAAH/AP+AAAAAAAP+AAH/gP/Af8AAP///+AAAB/wD////AAD/wH/AP+AAD////AAAAAH/AP/AAAAAAAP+AAH/gP/Af8AAP///+AAAB/wD////AAD/wH/AP+AAD////AAAAAH/AP+AAAAAAAP/AAH/gP/Af8AAP///+AAAB/wD////AAD/wH/AP+AAD////AAAAAH/AP+AAAAAAAP/AAH/gP/Af8AAP///+AAAB/wD////AAD/gH/gP+AAD////AAAAAH/AP+AAAAAAAP/AAH/gP/Af+AAP///+AAAB/wD////AAD/wH/AP+AAD////AAAAAH/gP+AAAAAA3//AAH/0v/Af+AAP///+AAAB/wD////gMT/wH/vv+AAD/////wD//////+AAAAAB///AAD////Af//AH//////8B/wD////////gH///+AAH//+B/wD/////4AAAAAAA/4AAAAA/8AAf//gAD/wD//8AAAAA/8B//+AAH///+AAH//4B/wD/////4AAAAAAA/4AAAAA/8AAf//gAB/wD//8AAAAA/8B//+AAH///+AAH//4B/wD/////4AAAAAAA/4AAAAA/8AAf//gAB/wD//8AAAAA/8B//+AAH///+AAH//4B/wD/////4AAAAAAA/4AAAAA/4AAf//gAB/wD//8AAAAA/8B//+AAH///+AAH//4B/wD/////4AAAAAAA/4AAAAA/8AAf//gAB/wD//8AAAAA/8B//+AAH///+AAH//4B/wD/////4AAAAAAA/4AAAAA/8AAf//gAB/wD//8AAAAA/8B//+AAH///+AAH//4B/wD/////4AAAAAAA/4AAAAA/8AAf//gAB/4D//8AAAAA/8B//+AAH///+AAH//4B/wD/////7+AAAAAA/4B//8A/9+Af//gHx/8///8AABg8//p////gH///+AAH//4B/wD//////+AAAAAAf4D//8A///Af//gH//////8AAP///////H/gAJ//+AAH//4B/wAAAAB//+AAAAAAAAB//+A///Af+AAH/AP///8AAP//////wD/gAB//+AAH//4B/wAAAAB//+AAAAAAAAB//+A///Af+AAH/AP///8AAP//////wD/gAA//+AAH//4B/wAAAAB//+AAAAAAAAB//+A///Af+AAH/AP///8AAP//////wD/gAB//+AAH//4B/wAAAAB//+AAAAAAAAB//+A///Af+AAH/AP///8AAP//////wD/gAA//+AAH//4B/wAAAAB//+AAAAAAAAB//+A///AP+AAH/AP///8AAP//////wD/gAB//+AAH//4B/wAAAAB//+AAAAAAAAB//+A///AP+AAH/AP///8AAP/8AAf/wD/gAB//+AAH//4B/wAAAAB//+AAAAAAAAB//+A///AP+AAH/AP///8AAP/gAAD/4D/gAB//+AAH//5L//8A/////+AAAAAAAP////////AP+A////////8AAP8AH8AP///gAA//+AAH//////8A///Af+AAAAAAAP/Af//gAAAP+A////wD//8AAAAP//8Af+AAAAAAAAAH//////8A///Af+AAAAAAAP/Af//gAAAP+A////wD//8AAAAf///AP+AAAAAAAAAH//////8A///Af+AAAAAAAH/Af//wAAAP+A////4D//8AAAD////wP+AAAAAAAAAH//////8A///Af+AAAAAAAH/Af//wAAAP+A////wD//8AAAP////4H+AAAAAAAAAH//////8A//+Af+AAAAAAAH/AP//wAAAP+A////4D//8AAA//////D+AAAAAAAAAH//////8A//+Af+AAAAAAAH/AP//wAAAP+A////4D//8AAB///f//h+AAAAAAAAAH//////8A///Af+AAAAAAAH/AP//wAAAP+Af///wD//8AAD//AB//w+AAAAAAAAAH//////8A///Af8AAAAAA///////wH////+////+b//8AAP/wAAH/4f/gAB/wAAf///////8A///APAAAAAAA///////wH/////////////8A4P/AAAA/+P/gAB/wAA///AAD/gAA///AAAAAAAAA///////wH//4D//8B////wAA4f8AAAAf/H/gAB/wAA///AAD/gAA//+AAAAAAAAA///////wH//4D//8B////wABw/4AAAAH/j/gAB/wAA///AAD/gAA//+AAAAAAAAA///////wH//4D//8B////wAAh/wAAAAD/j/gAB/wAA///AAD/gAA//+AAAAAAAAA///////wH//4D//8B////wAAj/AAAAAB/x/gAB/wAA///AAD/gAA//+AAAAAAAAA///////wH//4D//8B////wAAH+AAAAAA/4/gAB/wAA///AAD/gAA//+AAAAAAAAA///////wH//4D//8B////wAAH+AAAAAAf8fgAB/wAA///AAD/gAA//+AAAAAAAAAf//////wH//4D//8B////wAAP4AAAAAAP8fwAB/wAA///P53///////f/8AAAAAAf//////wH////////////wH8P4AAAAAAH8f/4B//+A///////////////8AAAAAAf8AAAD/wAD///APP/5f//wH8fwAAAAAYH+P/8AAf+A///////////////8AAAAAAf8AAAD/wAA//+AAH/AP//wH8/wAAAAD4D/P/8AAP+A///////////////8AAAAAAf8AAAD/wAA///AAH/gP//wH4/gAAAA/4B/H/8AAf+A///////////////8AAAAAAf8AAAD/wAA///AAH/gP//wH4/AAAAP/4B/H/8AAf+A///////////////8AAAAAAf8AAAD/wAA///AAH/AP//wHx/AAAD//4A/j/8AAP+A///////////////8AAAAAAf8AAAD/wAA///AAH/gP//wHx/AAAP//4A/j/8AAP+A///////////////8AAAAAAf8AAAD/wAA///AAH/gP//wHz+AAH///4A/j/8AAP+A///////////////8AAAAAAf+A////wD////AAH/gP//4Xj+AA////4A/z/89Af/////////////////8AAAAAAf+A////wH////AAD/gP////j+AH////gAfz///Af//////wAAAP/AAAAf8AAAAAAf+A////wH/gAAAAAAAP////j+AH///4AAfz///Af//////wAAAH/AAAAf8AAAAAAf+A////wD/gAAAAAAAP////j+AH//+AAAfx///Af//////wAAAH/AAAAf8AAAAAAf+A////wH/gAAAAAAAP////n8AH//wAAAfx///Af//////wAAAH/AAAAf8AAAAAAf+A////wD/gAAAAAAAP////j8AH/8AAAAPx///Af//////wAAAH/AAAAf8AAAAAAf+A////wD/gAAAAAAAP////n8AH/wAAAAPx///Af//////wAAAH/AAAAf8AAAAAAf+A////wD/gAAAAAAAP////n8AH4AAAEAfx///Af//////wAAAH/AAAA/8AAAAAAf+A////4D/gAAAAAAAP////n8AHAAAB8APx///Af//////08AAH/AP8A/8AAAAAAf+A////////////8A//////n8AAAAAf8APx///AP///////8AAEyAP+A/8AAAAAAf+A/////+A/////8A/4D/wAH8AAAAP/8APxgAAAAAAAP/Af8AAAAAP+A/4AAAAAAP+A/////+A/////8A/4D/wAH+AAAB//8AfxgAAAAAAAP/Af8AAAAAP+A/4AAAAAAP+A/////+A/////+A/4D/wAH+AAAf//8AfxgAAAAAAAP/Af8AAAAAP+A/4AAAAAAP+A/////+A/////+A/4B/wAD+AAD///8AfzgAAAAAAAP/Af8AAAAAP+A/4AAAAAAP+A/////+A/////8A/4D/wAD+AB////8AfzgAAAAAAAP/Af8AAAAAf+A/4AAAAAAP+A/////+A/////8A/4B/wAD+AP////8AfzgAAAAAAAP/Af8AAAAAf+A/4AAAAAAP+A/////+A/////+A/4B/wAD/AP////gAfjgAAAAAAAP/Af8AAAAAf+A/4AAAAAAP+A///////////////4B/wAD/AP///wAA/j//+AAD/AP///8AAAB/////4AAAAAAP+A//////////f////4B/wAB/AP//+AAA/h///AAD/gED//8AAAB/////4AAAAAAP+A///////gH/AAD/gAB/wAB/gP//gAAB/A///AAD/gAB//8AAAB/////4AAAAAAP+A///////gH/AAD/gAB/wAA/gP/4AAAB/A///AAD/gAB//8AAAB/////4AAAAAAP+A///////gH/AAD/gAB/wAA/wP/AAAAD+A///AAD/AAD//8AAAB/////4AAAAAAP+A///////gH/AAD/gAB/wAA/wPwAAAAD+A///AAD/AAB//8AAAB/////4AAAAAAP+A///////gH/AAD/gAB/wAAf4EAAAAAH8A///AAD/AAD//8AAAB/////4AAAAAAP+Af//////gH/AAD/gAB/wAAf8AAAAAAH8A///AAD/AAD//8AAAB/////4AAAAAAP/////////gH/gAD/gAB/wAAP+AAAAAAf4C///AX///////8AAP//////4AAAAAAP/////////gH//wD/gAB////H+AAAAAAf4////Af/////7/8AAP//wAAAAAAAAAAAD/wAB//+AAAB/wAAAAAAf//H/gAAAAA/x//4AAf////+AAAAAP//wAAAAAAAAAAAD/wAA//+AAAB/wAAAAAAf//D/wAAAAB/j//4AAf////+AAAAAP//wAAAAAAAAAAAD/wAB//+AAAB/wAAAAAAf//h/4AAAAH/D//4AAf////+AAAAAP//wAAAAAAAAAAAD/wAB//+AAAB/wAAAAAAf//g/8AAAAP/H//4AAf////+AAAAAP//wAAAAAAAAAAAD/wAB//+AAAB/wAAAAAAf//gf/AAAAf+P//4AAf////+AAAAAP//wAAAAAAAAAAAD/wAA//+AAAB/wAAAAAAf//gP/wAAB/4f//4AAf////+AAAAAP//wAAAAAAAAAAAD/4AB//+AAAB/wAAAAAAf//gH/8AAf/w///8AAf/////cgDsAP/////AAAAAAAAAB//8A////gAB/////4B////gD//6B//h/////////////gH/AP/////AAAAAAAAAAAf+A/4H/wAB/////4B/xRhAB//////D//gP//wH/AP//wH/AP+Af//AAAAAAAAAAAf+A/4D/wAB/////4B/wAAAIf////8P//gP//wH/AP//gH/AP+Af//AAAAAAAAAAAf+A/4D/wAB/////4B/wAAAMP////4P//gP//wH/AP//gH/AP+Af//AAAAAAAAAAAf+A/4D/wAB/////4B/wAAAPB////Af//gP//wH/AP//gH/AP+Af//AAAAAAAAAAAf+A/4D/wAB/////4B/wAAAPwf//8Af//gP//wH/AP//gH/AP+Af//AAAAAAAAAAAf+A/4D/wAA/////4B/wAAAP8B//AAf//gP//wH/AP//gH/AP+Af//AAAAAAAAAAAf+A/4D/wAB/////4B/wAAAP/AAAAAf//gP//wH/AP//wH/AP+Af//AAAAAAAAH///+A/4D/wH9/////8B/4HaAP/8AAH3///9///wH////////AP/////AAAAAAAAP///+A/4B/gH////////////gP//34H/+P5/4IAAAB/4D//8AAAD/gH/AAAAAAAAP///+A/4AAAH/AP//gH/Af//gP///8B/wAA/4AAAAB/4D//8AAAD/gH/AAAAAAAAP///+A/4AAAH/AP//gH/Af//gP///8B/wAA/4AAAAA/4D//8AAAD/gH/AAAAAAAAP///+A/4AAAH/gP//gH/Af//gP///8B/wAA/4AAAAA/4D//8AAAD/gH/AAAAAAAAP///+A/4AAAH/gP//gH/Af//gP///8B/wAA/4AAAAA/4D//8AAAD/gH/AAAAAAAAP///+A/4AAAH/AP//gH/Af//gP///8B/wAA/4AAAAB/wD//8AAAD/gH/AAAAAAAAP///+A/4AAAH/AP//gH/Af//gP///8B/wAA/4AAAAB/wD//8AAAD/gH/AAAAAAAAP///+A/8DwAH/gP//gH/Af//gP///8B/wAA/4AAAAB/4D//8AAAD/////wAAAAAAH///+A///////AH//gH/////gP///8A//8A/wAAAAA/wD//8AAAAA/8B/wAAAAAAH///+A/////+AAAD/gAB////gAAAAAAAf8AAAAAAAAAAD//8AAAAA/8B/wAAAAAAH///+A/////8AAAD/gAB////gAAAAAAAf8AAAAAAAAAAD//8AAAAA/8B/wAAAAAAH///+A/////8AAAD/gAB////gAAAAAAAf8AAAAAAAAAAD//8AAAAA/4B/wAAAAAAH///+A/////+AAAD/gAB////gAAAAAAAf8AAAAAAAAAAD//8AAAAA/4B/wAAAAAAH///+A/////+AAAD/gAB////gAAAAAAAf8AAAAAAAAAAD//8AAAAA/4B/wAAAAAAH///+A/////+AAAD/gAB////gAAAAAAAf8AAAAAAAAAAD//8AAAAA/4B/wAAAAAAH////A/////+AAAD/gAB////gAAAAAAAf8AAAAAAEAAAD//9EAL8A////wAAAAAAH//////////+AAAD/gAB////gAD//8AAP8AAAD/gH////////Af8AQP/AAAAAAAAH/AAD/gAAAf+AAAD/wAB/wH/gAD//8AAAAAAAD/gH///+A///Af8AAP/AAAAAAAAH/gAD/gAAAf+AAAD/wAB/wD/gAD//8AAAAAAAD/gH///+A///Af8AAP/AAAAAAAAH/gAD/gAAAf+AAAD/wAB/wD/gAD//8AAAAAAAD/gH///8A///Af8AAP/AAAAAAAAH/gAD/wAAAf+AAAB/wAB/wD/gAD//8AAAAAAAD/gH///8A///Af8AAP/AAAAAAAAH/gAD/wAAAf+AAAB/wAB/wD/gAD//8AAAAAAAD/gH///8A///Af8AAP+AAAAAAAAH/gAD/gAAAf+AAAB/wAB/wD/gAD//8AAAAAAAD/gH///8A///Af8AAP+AAAAAAAAH/gAD/wAAAf+AAAB/wAB/4D/gAD//8AAAAAAAD/gH///8A///Af8AAP/AAAAAAAAD//4D//8B//+A//////////////////////AAD//////////+Af8AAP//wAAAAAAAF/4D//8B//8A///M/////+C///AH//////gAAA////wH/gAAAf8AAP//wAAAAAAAA/4D//8B/4AA//+Af////8A//+AAH/////gAAA////wD/gAAAf8AAP//wAAAAAAAA/4D//8B/4AA///Af////+A///AAH/////AAAA////wD/gAAAf8AAP//wAAAAAAAA/4D//8B/wAA///Af////+A//+AAH/////AAAA////wD/gAAAf8AAP//wAAAAAAAA/4D//8B/4AA///Af////+A//+AAH/////AAAA////wD/gAAAf8AAP//wAAAAAAAA/4B//8B/4AA///Af////+A//+AAH/////AAAA////wD/gAAAf8AAP//wAAAAAAAA/4B//8B/4AA///Af////+A///AAH/////gAAA////wD/gAAAf8AAP//wAAAAAAAA/////8B/4D////Af//////////gH/////AAD/////////4AAf//AP//gAAAAAAAA/////8A/4D///+Af////v///3/gDv5/8HAAD//8FAf8A/4AAf//AP+AAAAAAAAAA///AAAAAAD//4AAf//AAD/gAD/wAAAf8AAAD//8AAf8A/4AAf//AP+AAAAAAAAAA///AAAAAAD//4AAf//AAD/gAD/wAAAf8AAAD//8AAf8A/4AAf//AP+AAAAAAAAAA///AAAAAAD//4AAf//AAD/gAD/gAAAf8AAAD//4AAf8A/4AAf//AP+AAAAAAAAAA///AAAAAAD//4AAf//AAD/gAD/gAAAf8AAAD//8AAf8A/4AAf//AP+AAAAAAAAAA///AAAAAAD//4AAf//AAD/gAD/gAAAf8AAAD//4AAf8A/4AAf//AP+AAAAAAAAAA///AAAAAAD//4AAf//AAD/gAD/gAAAf8AAAD//4AAf8A/4AAf//AP+AAAAAAAAD////AAH//////4AAf//////gAD/gH//////////4AAf///4AAf//AP+AAAAAAAAD///+AAH//////4AAf//////gAB/gH//////////4AAO3//4AA/8AAAAAAAAAAAAD/gAAAAH///+AAAAAAAB////gAAAAH///////+A/8AAAH//4AA/8AAAAAAAAAAAAD/gAAAAH///+AAAAAAAA////gAAAAH///////+A/4AAAH//4AA/8AAAAAAAAAAAAD/gAAAAH///+AAAAAAAB////gAAAAH///////+A/4AAAH//4AA/8AAAAAAAAAAAAD/gAAAAH///+AAAAAAAA////gAAAAH///////+A/4AAAH//4AA/8AAAAAAAAAAAAD/gAAAAH///+AAAAAAAA////gAAAAH///////+A/4AAAH//4AA/8AAAAAAAAAAAAD/gAAAAH///+AAAAAAAA////gAAAAH///////+A/4AAAH//4AA/8AAAAAAAAAAAAD/////gH///+Af/+AAH/////gPf/gH///////+A//+AAH///+A///AP8AAAAAAAAB/////wH///+A///AAH/////gP//wH///////8A///AAD//v+AcP/AP+AAAAAAAAAAf///wH/gP+Af//AAH/AAAAAP//gH/AAH//4AA///AAAAAP+AAH/Af8AAAAAAAAAAf///wH/gP+Af//AAH/AAAAAP//wH/AAH//4AA///AAAAAP+AAH/Af8AAAAAAAAAAf///wH/gP+Af//AAH/AAAAAP//wH/AAH//4AA///AAAAAP+AAH/Af8AAAAAAAAAAf///wD/gP+Af//AAH/AAAAAP//wH/AAH//wAA///AAAAAP+AAH/Af8AAAAAAAAAAf///wH/gP+Af//AAH/AAAAAP//wH/AAH//4AA///AAAAAP+AAH/Af8AAAAAAAAAAf///wD/gP+Af//AAH/gAAAAP//wH/AAH//4AA//+AAAAAP+AAH/Af8AAAAAAAAAA////4H/gP+Af//AAH/gAAAAP//wH/AAH//4CA///AIAAAP+CJv/Af8AAAAAAAAD//////////+Af//////AP+A////////////wD////Af/////////Af8AAAAAAAAD/wH///////+Af8B//8AAP+A/4AAf8B////AAD////Af/////////Af8AAAAAAAAB/wH///////+Af8B//8AAP+A/4AAf8B////AAD////Af/////////Af8AAAAAAAAB/wH///////+Af8B//8AAP+A/4AAf8B////AAD////Af/////////Af8AAAAAAAAD/wH///////+Af8B//8AAP+A/4AAf8B////AAD////Af/////////Af8AAAAAAAAB/wH///////+Af8B//+AAP+A/4AAf8B////AAD///+Af/////////Af8AAAAAAAAB/wH///////+Af8B//8AAP+A/4AAf8B////AAD///+Af/////////Af8AAAAAAAAB/wH////////Af8B//8AAP+A/4AAf8B////AAD///+Af/////////Af8AAAAAAAAB/wD//////////4B//8A//+A/4AAf8B////AAD///+Af///////////8AAAAAAAAAAAAAAAAAAAB/wAAAAAA//+A/4AAAAAAf//AAAAAAAAf//AAAA/4B//8AAAAAAAAAAAAAAAAAAAB/wAAAAAA//+A/4AAAAAAf//AAAAAAAAf//AAAA/4B//8AAAAAAAAAAAAAAAAAAAB/wAAAAAA//+A/4AAAAAAf//AAAAAAAAf//AAAA/4D//8AAAAAAAAAAAAAAAAAAAB/wAAAAAA//+A/4AAAAAAf//AAAAAAAAf//AAAA/4D//8AAAAAAAAAAAAAAAAAAAB/wAAAAAA//+A/4AAAAAAf//AAAAAAAA///AAAA/4B//8AAAAAAAAAAAAAAAAAAAB/wAAAAAA//+A/4AAAAAAf//AAAAAAAAf//AAAA/4D//8AAAAAAAAAAAAAAAAAAAB/wAAAAAA//+A/4AACAAAf//AAAAAAAAf//AAIA/4D//8AAAAAAAAB/////////8B//8AAf8A///////Af//Af//AAD//4AAf//Af8A/4D////AAAAAAAB/////////8AAf8AAf+AAAD/gP/Af//Af//AAD//4AA///Af8A/4D/wH/AAAAAAAB/////////8AAf8AAf+AAAD/gP/Af//Af//AAD//4AA///Af8A/4D/wH/AAAAAAAB/////////8AAf8AAf+AAAD/gP/Af//Af//AAD//4AA///Af8A/4D/wH/AAAAAAAB/////////8AAf8AAf+AAAD/gP/Af//Af//AAD//4AA///Af8A/4D/wH/AAAAAAAB/////////8AAf8AAf+AAAD/gP/Af//Af//AAD//4AA///Af8A/4D/gH/AAAAAAAB/////////8AAf8AAf+AAAD/gP/Af//Af//AAD//4AA///Af8A/4D/gH/AAAAAAAB/////////8AAf8AAf+AAAD/gP/Af//Af//AAD//4AA///Af8A/4D/wH/AAAAAAAB/////////8AAf//AP8A///////////Af//AP///4AA///AP8A////gH/AAAAAAAB/4AAAAAA/8AAf//AAAA//+A/////8AAf//AP8A/4AA///AAAA////gH/AAAAAAAB/4AAAAAAf8AAf//AAAA//+A/////8AAf//AP8A/4AA///AAAA////gH/AAAAAAAB/4AAAAAAf8AAf//AAAA//+A/////8AAf//AP8A/4AA///AAAA////gH/AAAAAAAB/4AAAAAAf8AAf//AAAA//+A/////8AAf//AP8A/4AA///AAAA////gH/AAAAAAAB/4AAAAAAf8AAf//AAAA//+A/////8AAf//AP8A/4AA///AAAA////gH/AAAAAAAB/4AAAAAAf8AAf//AAAA//+A/////8AAf//AP8A/4AA///AAAA////gH/AAAAAAAB/4AAAAAAf8AAf//gAAA//+A/////8AAf//AP8A/4AA///AAAA////gH/AAAAAAAB/4D///+Af8B/////4H//////////8AAf//AP/////////////////gH/AAAAAAAB/4D///+Af8B//8B/4D/////gP///8AAAH/AAD/////gP//////4AAAH/AAAAAAAB/4D////Af8B//8B/4D/////gP///8AAAH/AAD/////gP//////wAAAH/AAAAAAAA/4D////Af8B//8B/4D/////gP///8AAAH/AAD/////gP//////wAAAH/AAAAAAAA/4D////Af8B//8B/4D/////gP///8AAAH/AAD/////gP//////wAAAH/AAAAAAQA/4D////Af8B//8B/4D/////gP///8AAAH/AAD/////gP//////wAAAH/AAAAAAAA/4D////Af8B//8A/4D/////gP///8AAAH/AAD/////gP//////wAAAH/AAAAAAAA/4D////Af8B//8B/4D/////gH///8AAAH/gAD/////gP//////wAAAH/AAAAAAAA/4D////Af8A/////4D/////gH/////Af///wD/////////////wD///+AAAAAAAA/4D////Af8AAAH/gAD/////gP/////Af8B/wD/AP+A/4AAAAB/wD//4AAAAAAAAA/4D////Af8AAAH/gAD/////gP/////Af8B/wD/AP+A/4AAAAB/wD//4AAAAAAAAA/4D////Af8AAAD/gAD/////gP/////Af8B/wD/AP+A/4AAAAB/wD//4AAAAAAAAA/4D////Af8AAAH/gAD/////gH/////Af8B/wD/AP+A/4AAAAB/wD//4AAAAAAAAA/4D////Af8AAAH/gAD/////gP/////Af8B/wD/AP+A/4AAAAB/wD//4AAAAAAAAA/4D////Af8AAAH/gAD/////gP/////Af8B/wD/AP+A/4AAAAB/wD//4AAAAAAAAA/4D////Af8AAAH/gID/////gP/////Af8B/4D/gP+A/4AAAAB/wD//4AAAAAAAAA/4D////Af8B////AP//////gH/////Af///////////4D/wAB/wD///+AAAAAAAA/4D////Af8B//8AAP//gAD/gH/Af//AAH/Af///wD//4D/wAB/wD/gP+AAAAAAAA/4D////Af8B//8AAP//gAD/gP/Af//AAH/Af///4D//4D/wAB/wD/gP+AAAAAAAA/4D////Af8B//8AAP//gAD/gH/Af//AAH/Af///4D//4D/wAB/wD/gP+AAAAAAAA/4D////Af8B//8AAP//gAD/gH/Af//AAH/Af///4D//4D/wAB/wD/gP+AAAAAAAA/4B////Af8B//8AAP//gAD/gP/Af//AAH/Af///4D//4D/wAB/wD/gP+AAAAAAAA/4D////Af8B//8AAP//gAD/gP/Af//AAH/Af///wD//4D/wAB/wD/gP+AAAAAAAA/4B////Af8B//+gBP//pwD/gH/Af//AAH/oP///4D//4D/wAB/wD/gP+AAAwAAAA/4B////Af8A/////////4D/gH+Af//AAH//////////4D//8B//////+AAAwAAAA/4AAAAAAf8AAAD///+A/4D/gAAAf8AAAH//wAA//+A/4D//8AAf8A/4AAAPwAAAA/4AAAAAAf8AAAD///+A/4D/gAAAf8AAAH//wAA//+A/4D//8AAf8A/4AAAPgAAAA/4AAAAAAf8AAAD///+A/4D/gAAAf8AAAH//wAA//+A/4D//8AAf8A/4AAAOAAAAA/4AAAAAAf+AAAD///+A/4D/gAAAf8AAAH//wAA//+A/4D//8AAf8A/4AAAOAAAAA/4AAAAAAf+AAAD///+A/4D/gAAAf8AAAH//wAA//+A/4D//8AAf8A/4AAALAAAAA/4AAAAAAf+AAAD///+A/4D/gAAAf8AAAH//wAA//+A/4D//8AAf8A/4AAAPgAAAA/8AAAAAAf+AAAD////O//7/3+fv//1B/X//xgB//+A/4D//8AAf8A/4AAAPgAAAA/////////+A/4D/////////////+////////////+A/////8AAf8A//+AAPgABAA/////////+A/4D/////////////wH///8B//////+AAP+A/8AAAAA//+AAbgAAAA/////////+A/4D/////////////wH///8B//////+AAP+Af8AAAAA//+AAagAAAA/////////+A/4D/////////////wH///8B//////+AAP+Af8AAAAA//+AAJgAAAA/////////+A/4D/////////////wH///8B//////+AAP+Af8AAAAA//+AAHgAAAAf////////+A/4D/////////////wH///8B//////+AAP+Af4AAAAA//+AADgAAAAf////////+A/4D/////////////wH///8B//////8AAP+Af8AAAAA//+AAPgAAAAf////////+A/4D/////////////wH///8B//////8AAP+Af8AAAAA//+AAfAAAAAf////////+A/4B/////////////gH///8A//////8AAP+Af4AAAAA//+AAPAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACDwAAAAAAAAAAAAAAAwb+MGfwGCIEYfww+AwgBACAAGAAAAAAAAAAAAAAAAAAAAADD4AAAAAAAAAAAAAAAwb/MHf4GDcM+f75/j5wDGDP+OH+fHx8fHwAAAAAAAAAAAAD/gAAAEAAAAAAAAAAAwb/sHc8GDcN/f/9/z9wHGDP2OP+/n78fPwAAAAAAAAAAAADPwAAAgAAAAAAAAAAAwbBsHYM2DeNjYHNgzPwPGDMGfNgxubGzsYAAAAAAAAAAAADAQAADoAAAAAAAAAAAwbjsHYE2DfNjemPgXGwPn/PmbN8TvzG7sYAAAAAAAAAAAADgAAAD/IAAAAAAAAAAwb/sHYEGDbNzf2PgeHwDH/fzbP+Hv7GfMYAAAAAAAAAAAADiAAAA/4AAAAAAAAAAwb/MHYMGDZs/f2PgfHgDH/czb5mHv7+/v4AAAAAAAAAAAADgAAAAf4AAAAAAAAAAwbkMHYMGDZ8/YGNg2GwDGDAz55GB8Z+7n4AAAAAAAAAAAACAAAAAewAAAAAAAAAA4bAMHYcHHY9nYHNh3PwDGDYzx7GxsbWxnYAAAAAAAAAAAACAAAAA/wAAAAAAAAAAfzgMHf43+Yd+YD9/z9/DGDfzx7+7u7u7v4AAAAAAAAAAAABAAAAA/wAAAAAAAAAAPxAMHf4z+Yc+YD9/j8/jHDPxxx+/n78/vwAAAAAAAAAAAAAAAAAAY4AAAAAAAAAAAAAAAAAA4AAYIA4sAwnBCBHggw8PDh4fHgAAAAAAAAAAAAAAAAAAP4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function receiptAmount(value: number): string {
  return `Rs.${value.toFixed(2)}`;
}

function itemName(item: Record<string, unknown>): string {
  const product = item.item as Record<string, unknown> | undefined;
  const nestedProduct = item.product as Record<string, unknown> | undefined;
  const value = item.name ?? item.title ?? product?.name ?? nestedProduct?.name;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Item';
}

class ThermalPrinterService {
  private connectedAddress: string | null = null;

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (Number(Platform.Version) < 31) {
      return true;
    }

    try {
      const permissions = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      return (
        permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.error('Could not request Bluetooth permissions:', error);
      return false;
    }
  }

  async ensureBluetoothEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      if (isBluetoothEnabled()) {
        return true;
      }
      return await requestEnableBluetooth();
    } catch (error) {
      console.error('Could not enable Bluetooth:', error);
      return false;
    }
  }

  async getPairedPrinters(): Promise<BluetoothDevice[]> {
    try {
      const devices = await getPairedDevices();
      return devices.filter((device) => {
        const name = device.name?.toLowerCase() ?? '';
        return name.includes('printer') || name.includes('atpos');
      });
    } catch (error) {
      console.error('Could not load paired Bluetooth devices:', error);
      return [];
    }
  }

  async connect(address: string): Promise<boolean> {
    if (!address.trim() || !(await this.requestPermissions())) {
      return false;
    }
    if (!(await this.ensureBluetoothEnabled())) {
      return false;
    }

    try {
      const connected = await connectDevice(address);
      if (!connected) {
        return false;
      }
      this.connectedAddress = address;
      await AsyncStorage.setItem(PRINTER_ADDRESS_KEY, address);
      return true;
    } catch (error) {
      console.error('Could not connect to the Bluetooth printer:', error);
      return false;
    }
  }

  async getSavedPrinterAddress(): Promise<string | null> {
    return AsyncStorage.getItem(PRINTER_ADDRESS_KEY);
  }

  async autoConnect(): Promise<boolean> {
    try {
      const connectedDevice = getConnectedDevice();
      if (connectedDevice?.id) {
        this.connectedAddress = connectedDevice.id;
        return true;
      }

      const address = this.connectedAddress ?? (await this.getSavedPrinterAddress());
      return address ? this.connect(address) : false;
    } catch (error) {
      console.error('Could not reconnect to the saved Bluetooth printer:', error);
      return false;
    }
  }

  async printReceipt(billData: any): Promise<boolean> {
    if (!(await this.autoConnect())) {
      return false;
    }

    try {
      const bill = billData && typeof billData === 'object' ? billData : {};
      const lines = Array.isArray(bill.lines)
        ? bill.lines
        : Array.isArray(bill.items)
          ? bill.items
          : [];
      const total = numberValue(bill.grandTotal ?? bill.totalAmount ?? bill.total);
      const commands: string[] = [
        EscPos.INIT,
        EscPos.textCenter(`${String(bill.restaurantName || 'GOLA RESTAURANT').slice(0, RECEIPT_WIDTH)}\n`),
        EscPos.textCenter('BILL\n'),
        EscPos.horizontalLine(),
        EscPos.textLeft(`Bill No: ${bill.billNumber || bill._id || 'N/A'}\n`),
        EscPos.textLeft(`Date: ${new Date(bill.createdAt || Date.now()).toLocaleString()}\n`),
        EscPos.horizontalLine(),
      ];

      lines.forEach((value: unknown) => {
        const item =
          value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
        const quantity = numberValue(item.quantity ?? item.qty, 1);
        const price = numberValue(item.price ?? item.unitPrice);
        const lineTotal = numberValue(item.total ?? item.lineTotal, price * quantity);
        commands.push(
          EscPos.textLeft(`${itemName(item).slice(0, RECEIPT_WIDTH)}\n`),
          EscPos.printJustify(
            `${quantity} x ${receiptAmount(price)}`,
            receiptAmount(lineTotal),
            1,
            RECEIPT_WIDTH,
          ),
        );
      });

      commands.push(EscPos.horizontalLine());
      if (numberValue(bill.discount) > 0) {
        commands.push(
          EscPos.printJustify('Discount', receiptAmount(numberValue(bill.discount)), 1, RECEIPT_WIDTH),
        );
      }
      commands.push(
        EscPos.setAlign(EscPos.Align.RIGHT),
        EscPos.BOLD_ON,
        EscPos.text(`TOTAL: ${receiptAmount(total)}\n`),
        EscPos.BOLD_OFF,
      );
      if (bill.amountPaid != null) {
        commands.push(EscPos.textLeft(`Paid: ${receiptAmount(numberValue(bill.amountPaid))}\n`));
      }
      if (bill.balanceDue != null) {
        commands.push(EscPos.textLeft(`Balance Due: ${receiptAmount(numberValue(bill.balanceDue))}\n`));
      }
      commands.push(
        EscPos.textCenter('\nThank you for dining with us!\n'),
        EscPos.setAlign(EscPos.Align.CENTER),
        PAYMENT_QR_RASTER_COMMAND,
        EscPos.setAlign(EscPos.Align.LEFT),
        EscPos.newLine(3),
        EscPos.cut(),
      );

      return await printRaw(EscPos.combineCommands(...commands));
    } catch (error) {
      console.error('Could not print the bill receipt:', error);
      return false;
    }
  }

  async printTestReceipt(): Promise<boolean> {
    if (!(await this.autoConnect())) {
      return false;
    }

    try {
      const testReceipt = EscPos.combineCommands(
        EscPos.INIT,
        EscPos.textCenter('GOLA RESTAURANT\n'),
        EscPos.horizontalLine(),
        EscPos.textCenter('PRINTER TEST\n'),
        EscPos.textCenter('Bluetooth connected.\n'),
        EscPos.newLine(3),
        EscPos.cut(),
      );
      return await printRaw(testReceipt);
    } catch (error) {
      console.error('Could not print the test receipt:', error);
      return false;
    }
  }
}

export default new ThermalPrinterService();
