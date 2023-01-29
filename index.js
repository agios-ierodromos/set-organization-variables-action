const core = require('@actions/core');
const { Octokit } = require("@octokit/rest");
const io = require('@actions/io');
const validUrl = require('valid-url');
const UrlPattern = require('url-pattern');
const dotenv = require('dotenv');
const fs = require('fs');
const fetch = require('node-fetch');

// most @actions toolkit packages have async methods
async function run() {
    try {
        const token = core.getInput('github-token', { required: true })
        const fileName = core.getInput('dotenv-file');
        const url = core.getInput('url');
        const shouldKeepFile = core.getInput('keep-file');

        const fileExists = !!fileName && io.exists(fileName);
        const isValidUrl = validUrl.isWebUri(url);
        const shouldLoadLocalFile = !isValidUrl && fileExists;

        if (!isValidUrl && !fileExists) {
            core.setFailed('No input specified, should have either a dotenv-file or an url, at least.');
        }

        if (shouldLoadLocalFile) {
            console.log(`Loading local environment file ${fileName} …`);
        } else {
            if (isGitHub) {
                const fileInfo = getGitHubRepoInfo(url);
                await getGitHubFile(token, fileInfo.owner, fileInfo.repo, fileInfo.path, fileInfo.ref, fileName);

                console.log(`Loading environment file ${fileInfo.path} from repository ${fileInfo.owner}/ ${fileInfo.repo} …`);
            } else {
                fetch(url)
                    .then(res => res.text())
                    .then(body => {
                        try {
                            fs.writeFile(fileName, body, function (error) {
                                if (error) {
                                    core.setFailed(error.message);
                                }
                            });
                        } catch (error) {
                            core.setFailed(error.message);
                        }
                    });

                console.log(`Loading environment from remote ${fileName} …`);
            }
        }

        const envContent = fs.readFileSync(fileName, { encoding: 'utf8' });
        const env = dotenv.parse(envContent);

        for (const [key, value] of Object.entries(env)) {
            core.info(`Setting ${key}=${value}`)

            core.exportVariable(key, value)
            // core.setOutput(key, value)
        }

        if (!shouldKeepFile) {
            console.log(`Removing file ${fileName} …`);

            core.saveState("fileName", fileName);
        }

        core.setOutput('time', new Date().toTimeString());
    } catch (error) {
        core.setFailed(error.message);
    }
}

function isGitHub(url) {
    const hostPattern = new UrlPattern('(http(s)\\://)(:subdomain.):domain.:tld(\\::port)(/*)');
    const hostMatch = hostPattern.match(url);

    return hostMatch.domain == 'github' && hostMatch.tld == 'com';
}

function getGitHubRepoInfo(url) {
    if (!isGitHub(url)) return undefined;

    // https://github.com/agios-ierodromos/.github-private/blob/main/.env
    // https://raw.githubusercontent.com/agios-ierodromos/.github-private/main/.env?token=GHSAT0AAAAAABTYHEFBFEIHAXLUVQI7EQYSY6WTD5A
    const hostPattern = new UrlPattern('(http(s)\\://):domain/:owner/:repo/blob/:ref/:path(?*)');
    const hostMatch = hostPattern.match(url);

    return { owner: hostMatch, repo: hostMatch, path: hostMatch };
}

async function getGitHubFile(token, owner, repo, path, ref, fileName) {
    try {
        const github = new Octokit(token, {});

        const existing = await github.rest.repos.getContent({
            owner,
            repo,
            path,
            ref,
        });

        if (existing.status === 200) {
            if (existing.data.content) {
                const dotenv = Buffer.from(existing.data.content, 'base64').toString('ascii');

                try {
                    fs.writeFile(fileName, dotenv, function (error) {
                        if (error) {
                            core.setFailed(error.message);
                        }
                    });
                } catch (error) {
                    core.setFailed(error.message);
                }

                console.log('Downloaded "' + fileName + '" file');
            } else {
                core.setFailed('".env" file is empty');
            }
        } else {
            core.setFailed('No ".env" file to download, or no rights to access it.');
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
