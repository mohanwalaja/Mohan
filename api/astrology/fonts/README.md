# Required font files

Download these from Google Fonts (fonts.google.com) on your phone, unzip, and
copy the `.ttf` files into this folder using these EXACT filenames
(the report HTML and the browser PDF capture reference them by these names):

| Google Font                       | Weight(s) needed        | Save as                     |
|-----------------------------------|--------------------------|------------------------------|
| Cinzel                            | SemiBold (600), Bold (700), ExtraBold (800) | `Cinzel-SemiBold.ttf`, `Cinzel-Bold.ttf`, `Cinzel-ExtraBold.ttf` |
| Baloo Thambi 2                    | SemiBold (600), Bold (700), ExtraBold (800) | `BalooThambi2-SemiBold.ttf`, `BalooThambi2-Bold.ttf`, `BalooThambi2-ExtraBold.ttf` |
| Yatra One                         | Regular                  | `YatraOne-Regular.ttf`       |
| Noto Sans                         | Regular, Medium, SemiBold, Bold | `NotoSans-Regular.ttf`, `NotoSans-Medium.ttf`, `NotoSans-SemiBold.ttf`, `NotoSans-Bold.ttf` |
| Noto Sans Tamil                   | Regular, Medium, SemiBold, Bold | `NotoSansTamil-Regular.ttf`, `NotoSansTamil-Medium.ttf`, `NotoSansTamil-SemiBold.ttf`, `NotoSansTamil-Bold.ttf` |
| Noto Sans Devanagari               | Regular, Medium, SemiBold, Bold | `NotoSansDevanagari-Regular.ttf`, `NotoSansDevanagari-Medium.ttf`, `NotoSansDevanagari-SemiBold.ttf`, `NotoSansDevanagari-Bold.ttf` |

How to get them on Android (no computer needed):
1. Go to fonts.google.com, search each family above.
2. Tap "Download family" (downloads a .zip of all weights).
3. Use a file manager app (or Termux `unzip`) to extract the .zip.
4. Move/rename the specific weight files into this folder to match the table exactly.

These fonts are served as static assets and loaded by the report HTML in the
browser; nothing on the server renders a PDF any more (mPDF was removed in
October 2026), so no Composer install is needed for them. Keep the files: the
customer download, the emailed PDF and the admin preview all capture the same
HTML, and removing a font would change every one of them.
