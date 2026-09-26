// Upload one image per request. Only acknowledge the draft after the final save.
export async function saveVisitWithPhotos(body, request) {
 const photos=body.photos||(body.photo?[body.photo]:[]);
 if(photos.length>5)throw new Error('photo_limit');
 if(!photos.some(p=>p.base64))return request(body);
 const {photo,photos:ignored,document,...fields}=body;
 const references=[];
 for(const image of photos){
  if(image.base64){const result=await request({...fields,action:'upload_photo',photo:image});if(!result.receipt)throw new Error('photo_pending');references.push({receipt:result.receipt});}
  else references.push({hash:image.hash});
 }
 return request({...fields,photos:references});
}
