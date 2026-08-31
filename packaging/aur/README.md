# AUR package

These files publish Requin as the `requin` AUR source package. On an Arch
Linux system, validate changes before publishing:

```sh
makepkg --printsrcinfo > .SRCINFO
makepkg --cleanbuild --syncdeps
namcap PKGBUILD requin-*.pkg.tar.zst
```

The AUR repository must contain `PKGBUILD` and `.SRCINFO` at its root and use
the `master` branch.
