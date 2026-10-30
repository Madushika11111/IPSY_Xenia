export const config = {
  baseUrl: 'https://be.contentful.com',
  appBaseUrl: 'https://app.contentful.com',
  loginUrl: 'https://be.contentful.com/login',
  spaceId: '4y6inol5l00q',
  xeniaSpaceId: '78IuQTY05RWYFdrLArOIoG',
  xeniaSpaceName: 'Xenia Version 1 Space',
  xeniaAppName: 'Xenia-Version1_QAV1',
  // xeniaLocalUrl: 'http://localhost:9323/',
  credentials: {
    email: process.env.CONTENTFUL_EMAIL ?? '',
    password: process.env.CONTENTFUL_PASSWORD ?? '',
  },
};
