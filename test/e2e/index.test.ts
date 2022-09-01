import puppeteer from 'puppeteer';

const isProduction = process.argv[2] === '-p';
const port = parseInt(process.env.PORT, 10) || (isProduction ? 443 : 3000);
const domain = process.env.APP_HOST
const SERVER_NAME = 'local.webaverse.com';

const width = 1280;
const height = 800;
const viewScale = 1;
let browser
let page
const lanuchBrowser = async () => {
	browser = await puppeteer.launch( {
		headless: ! process.env.VISIBLE,
		args: [
			'--use-gl=swiftshader',
			'--no-sandbox',
			'--enable-surface-synchronization'
		],
		devtools: !isProduction
	})
	page = ( await browser.pages() )[ 0 ];
	await page.setViewport( { width: width * viewScale, height: height * viewScale } );
	console.log('Waiting 5 secs for server lunch')
	page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
	await page.waitForTimeout(5000)
	enterRoom(`https://${SERVER_NAME}:${port}`)
}
lanuchBrowser()

const enterRoom = async (url) => {
	console.log('Enter Room: ', url)
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180 * 1000 })
	console.log('-------------------------Room Loaded')
}