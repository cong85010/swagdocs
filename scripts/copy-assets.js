import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const copyRecursive = (src, dest) => {
    if (!existsSync(src)) return;

    mkdirSync(dest, { recursive: true });

    const entries = readdirSync(src);
    entries.forEach(entry => {
        const srcPath = join(src, entry);
        const destPath = join(dest, entry);

        if (statSync(srcPath).isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            copyFileSync(srcPath, destPath);
        }
    });
};

// Copy content scripts (JS and CSS files)
if (existsSync('src/content')) {
  mkdirSync('dist/src/content', { recursive: true });
  const contentFiles = readdirSync('src/content');
  contentFiles.forEach(file => {
    if (file.endsWith('.js') || file.endsWith('.css')) {
      copyFileSync(join('src/content', file), join('dist/src/content', file));
    }
  });
}

// Copy background scripts
if (existsSync('src/background')) {
    copyRecursive('src/background', 'dist/src/background');
}

// Copy manifest
if (existsSync('manifest.json')) {
    copyFileSync('manifest.json', 'dist/manifest.json');
}

// Copy icons if they exist
if (existsSync('icons')) {
    copyRecursive('icons', 'dist/icons');
} else {
    // Create placeholder icons directory
    mkdirSync('dist/icons', { recursive: true });
    console.warn('Warning: icons directory not found. Please add icon16.png, icon48.png, and icon128.png to the icons folder.');
}

// Fix popup.html paths
if (existsSync('dist/index.html')) {
    const fs = await import('fs');
    let html = fs.readFileSync('dist/index.html', 'utf8');
    html = html.replace('/index.js', 'index.js');
    html = html.replace('/index.css', 'index.css');
    fs.writeFileSync('dist/popup.html', html);
}

console.log('Assets copied successfully!');
