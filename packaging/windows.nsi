; NSIS 3, compiled as UTF-8. All paths are supplied by scripts/package-windows.mjs.
; DELETE_INCLUDE contains only payload Delete commands and empty-directory RMDir
; commands. Each failed Delete must set $UninstallFileErrors to "1". The marker,
; uninstaller, and installation root are handled here after payload removal.

!ifndef VERSION
  !error "VERSION is required"
!endif
!ifndef PAYLOAD_DIR
  !error "PAYLOAD_DIR is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif
!ifndef DELETE_INCLUDE
  !error "DELETE_INCLUDE is required"
!endif

Unicode true
RequestExecutionLevel user
AllowRootDirInstall false
SetCompressor /SOLID lzma
CRCCheck force

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.swire.companion"
!define INSTALL_MARKER "com.swire.companion"

Name "Swire"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Swire"
BrandingText "Swire"
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Swire"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "FileDescription" "Swire installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Swire"

Var UninstallFileErrors

!define MUI_ABORTWARNING
!define MUI_DIRECTORYPAGE_TEXT_TOP "Choose a new, empty folder for Swire. To replace an existing installation, uninstall it first. Your saved settings and conversations are kept when uninstalling."
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE CheckInstallDirectory
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  SetShellVarContext current
  SetRegView 64
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Swire requires 64-bit Windows." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "UninstallString"
  StrCmp $0 "" no_existing_install
    MessageBox MB_OK|MB_ICONSTOP "Swire is already installed. Uninstall it from Windows Settings before installing this version. Your saved settings and conversations will be kept." /SD IDOK
    SetErrorLevel 2
    Abort
  no_existing_install:
FunctionEnd

; This runs on leaving the directory page AND from the install section, so /S
; and /D cannot bypass the empty-directory rule. Existing files are never erased.
Function CheckInstallDirectory
  StrCmp $INSTDIR "" invalid_install_directory
  GetFullPathName $0 "$INSTDIR"
  StrCmp $0 "" invalid_install_directory
  StrCpy $INSTDIR $0
  ${GetRoot} "$INSTDIR" $1
  StrCmp $INSTDIR $1 invalid_install_directory
  StrCmp $INSTDIR "$1\" invalid_install_directory

  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i .r0 ?e'
  Pop $2
  IntCmp $0 -1 check_missing_directory
  IntOp $1 $0 & 0x10
  IntCmp $1 0 invalid_install_directory
  ; Do not use a directory junction or symbolic link as the installation root.
  IntOp $1 $0 & 0x400
  IntCmp $1 0 check_directory_contents invalid_install_directory invalid_install_directory

  check_missing_directory:
    ; Only missing paths are new directories. Access-denied and other failures
    ; must not be mistaken for permission to install into an existing folder.
    IntCmp $2 2 install_directory_ready
    IntCmp $2 3 install_directory_ready invalid_install_directory invalid_install_directory
  check_directory_contents:
    ; This native Unicode API handles empty directories even when enumeration
    ; returns no entries, and excludes the special "." and ".." entries.
    System::Call 'shlwapi::PathIsDirectoryEmptyW(w "$INSTDIR") i .r0'
    IntCmp $0 0 invalid_install_directory
  install_directory_ready:
    ClearErrors
    Return
  invalid_install_directory:
    MessageBox MB_OK|MB_ICONSTOP "Choose a new or empty folder for Swire. Existing installations must be uninstalled first; other files in the selected folder will not be removed." /SD IDOK
    SetErrorLevel 2
    Abort
FunctionEnd

Section "Swire" SEC_INSTALL
  Call CheckInstallDirectory
  SetShellVarContext current
  SetRegView 64
  ClearErrors
  SetOutPath "$INSTDIR"
  IfErrors install_failed
  ; Write the recovery files before the payload, so a partial install can be
  ; cleaned up by running its uninstaller without deleting unrelated files.
  File /oname=.swire-install "${PAYLOAD_DIR}\.swire-install"
  IfErrors install_failed
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  IfErrors install_failed
  File /r /x .swire-install "${PAYLOAD_DIR}\*"
  IfErrors install_failed

  CreateShortcut "$SMPROGRAMS\Swire.lnk" "$INSTDIR\Swire.exe"
  IfErrors install_failed
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "Swire"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\Swire.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  IfErrors install_failed
  Goto install_finished

  install_failed:
    MessageBox MB_OK|MB_ICONSTOP "Swire could not be installed completely. If Uninstall.exe was created in the selected folder, run it to clean up the partial installation before trying again." /SD IDOK
    SetErrorLevel 2
    Abort
  install_finished:
    SetErrorLevel 0
SectionEnd

Function un.CheckInstallMarker
  ; Reject a replaced installation root before opening anything inside it.
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i .r0'
  IntCmp $0 -1 invalid_install_marker
  IntOp $1 $0 & 0x10
  IntCmp $1 0 invalid_install_marker
  IntOp $1 $0 & 0x400
  IntCmp $1 0 0 invalid_install_marker invalid_install_marker
  ClearErrors
  FileOpen $0 "$INSTDIR\.swire-install" r
  IfErrors invalid_install_marker
  FileSeek $0 0 END $1
  IfErrors close_invalid_install_marker
  ; Require the exact ASCII marker, including its length (no trailing content).
  IntCmp $1 19 0 close_invalid_install_marker close_invalid_install_marker
  FileSeek $0 0 SET
  FileRead $0 $1
  IfErrors close_invalid_install_marker
  FileClose $0
  StrCmpS $1 "${INSTALL_MARKER}" valid_install_marker invalid_install_marker

  close_invalid_install_marker:
    FileClose $0
  invalid_install_marker:
    MessageBox MB_OK|MB_ICONSTOP "This folder could not be verified as a Swire installation. No files have been removed." /SD IDOK
    SetErrorLevel 2
    Abort
  valid_install_marker:
FunctionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  Call un.CheckInstallMarker
FunctionEnd

Section "Uninstall"
  Call un.CheckInstallMarker
  SetShellVarContext current
  SetRegView 64
  ; Leave the installation directory before attempting to remove it.
  SetOutPath "$TEMP"
  StrCpy $UninstallFileErrors "0"
  !include "${DELETE_INCLUDE}"
  StrCmp $UninstallFileErrors "0" payload_removed
    MessageBox MB_OK|MB_ICONSTOP "Some Swire files could not be removed. Close Swire and run this uninstaller again. Your saved settings and conversations have been kept." /SD IDOK
    SetErrorLevel 2
    Abort

  payload_removed:
    ; An old or relocated uninstaller must not remove another installation's
    ; shortcut or registration. User data under AppData is never touched.
    ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
    StrCmp $0 $INSTDIR remove_registration keep_registration
  remove_registration:
    Delete "$SMPROGRAMS\Swire.lnk"
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
  keep_registration:
    Delete "$INSTDIR\Uninstall.exe"
    Delete "$INSTDIR\.swire-install"
    ; This deliberately fails harmlessly if the user added any other files.
    RMDir "$INSTDIR"
    SetErrorLevel 0
SectionEnd
