# exeIconRPC

Vencord userplugin. Shows the exe icon on your Rich Presence for games Discord doesn't recognize. Manually added exes normally show up with a blank icon, this fixes that.
When a game is detected the plugin grabs the exe icon, hosts it, proxies it through Discord, and swaps the stock activity for an identical one with the icon attached. 
Needs Discord Desktop or Vesktop (reading exe icons needs native code, vesktop not tested), plus an Application ID pasted in settings. Make one at the Discord Developer Portal, 


Install:


You need to build Vencord from source, the installer build can't load custom plugins. If you haven't, follow the [installing from source](https://docs.vencord.dev/installing/) guide first.


1. Clone this repo into `src/userplugins` in your Vencord repo folder 
2. Rebuild Vencord and reinject, 
3. Enable ExeIconRPC, paste your App ID, add your exe under Registered Games


Icons are cached per exe. Exes you want left alone go in the opt-out setting.
