fpcalc binaries @ https://github.com/acoustid/chromaprint/releases
- linux: arm64, through `apt-get install libchromaprint-tools`
- macos: universal, through github chromaprint release

EDIT: chromaprint-linux-arm64 is now available in chromaprint releases, tested to be working on Debian 11 (though at the time of the test, libchromaprint-tools were already installed).

the arm64 build of chromaprint will be available in v1.6 (not yet released), but is already available from github as a build artifact of a github action

In the future obtaining the correct binary could be automated by requesting a JSON of the latest release (https://api.github.com/repos/acoustid/chromaprint/releases/latest) and comparing the filenames to data from `require('os').platform()` and `required('os').arch()`.