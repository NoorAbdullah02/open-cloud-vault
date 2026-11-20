#define MyAppName "NOOR DRIVE"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Noor Abdullah"
#define MyAppURL "https://drive.noor.is-a.dev"
#define MyAppExeName "noor_drive_app.exe"

[Setup]
AppId={{D37F8E45-8C1B-443B-984F-A16298B75691}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\NOOR DRIVE
DisableProgramGroupPage=yes
OutputDir=..\..\
OutputBaseFilename=NoorDrive-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Start NOOR DRIVE automatically when Windows starts"; GroupDescription: "Startup:"

[Files]
Source: "..\..\apps\mobile\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
