## exeIconRPC

Discontinued. Vencord staff flagged this as unsafe, do not use. Repo stays up for reference only.

Vencord userplugin. Shows the exe icon on your Rich Presence for games/apps Discord doesn't recognize.

<img width="1920" height="1080" alt="smthing" src="https://github.com/user-attachments/assets/cabdabe9-e76d-46f2-8547-8e8b119781c0" />


Needs Discord Desktop, plus an Application ID pasted in settings. Make one at the [Discord Developer Portal](https://discord.com/developers/applications), 
Disclaimer: icons go through [catbox](https://catbox.moe/) first so Discord can fetch them,

Install:
You need to build Vencord from source, the installer build can't load custom plugins. If you haven't, follow the [installing from source](https://docs.vencord.dev/installing/) guide first, then the [install guide](https://docs.vencord.dev/installing/custom-plugins/).

1. Clone this repo into `src/userplugins` in your Vencord repo folder so it lands at `src/userplugins/exeIconRPC`
2. Rebuild Vencord and reinject, 
3. Enable ExeIconRPC, paste your App ID, add your exe under Discord Settings > Registered Games

To update later: `git pull` inside `src/userplugins/exeIconRPC`, rebuild again. 
Icons are cached per exe, Clear Icon Cache in settings wipes them. Exes you want left alone go in the opt-out setting.
Not supported by Vencord, do not ask in their support channel.

