package com.fenice.geofieldgps;
import android.app.Instrumentation;import android.os.Bundle;import android.content.SharedPreferences;
public class RenewalProbe extends Instrumentation {
 private Bundle args; public void onCreate(Bundle b){super.onCreate(b);args=b;start();}
 private void check(boolean b,String reason){if(!b)throw new IllegalStateException(reason);}
 public void onStart(){Bundle out=new Bundle();try{
 SharedPreferences p=getTargetContext().getSharedPreferences("tracker_prefs",0);String mode=args.getString("mode","enroll");String url="https://preview.tugeocercas.com/api/send-position";
 if(mode.equals("enroll")){
  p.edit().clear().putString("access_token",args.getString("token")).putString("tracker_access_token",args.getString("token")).putString("tracker_user_id",args.getString("user")).putString("org_id",args.getString("org")).putString("runtime_refresh_token",args.getString("refresh")).putString("runtime_renew_request_id",args.getString("request")).commit();
  check(RuntimeSessionRenewal.INSTANCE.renewIfNeeded(getTargetContext(),url),"enrollment failed");String first=p.getString("access_token","");check(!first.equals(args.getString("token")),"access not rotated");
  p.edit().putString("access_token",args.getString("token")).putLong("runtime_access_expires_at",0).putString("runtime_renew_request_id",args.getString("request")).commit();
  check(RuntimeSessionRenewal.INSTANCE.renewIfNeeded(getTargetContext(),url),"lost response retry failed");check(first.equals(p.getString("access_token","")),"retry changed access");
  p.edit().putLong("runtime_access_expires_at",0).commit();String refresh=p.getString("runtime_refresh_token","");
  check(!RuntimeSessionRenewal.INSTANCE.renewIfNeeded(getTargetContext(),"https://127.0.0.1:1/api/send-position"),"offline test unexpectedly succeeded");check(first.equals(p.getString("access_token",""))&&refresh.equals(p.getString("runtime_refresh_token","")),"offline erased credentials");
  out.putString("result","PASS enrollment, lost response idempotency, offline preservation");
 }else{String old=p.getString("access_token","");p.edit().putLong("runtime_access_expires_at",0).putLong("runtime_renew_retry_at",0).remove("runtime_renew_request_id").commit();boolean ok=RuntimeSessionRenewal.INSTANCE.renewIfNeeded(getTargetContext(),url);
  if(mode.equals("revoked")){check(!ok,"revoked session renewed");check(old.equals(p.getString("access_token","")),"revocation erased credentials");out.putString("result","PASS revoked session rejected");}
  else {check(ok,"persisted session renewal failed");check(!old.equals(p.getString("access_token","")),"access unchanged");out.putString("result","PASS persisted refresh recovers expired access in new process");}
 }
 finish(-1,out);
 }catch(Throwable e){out.putString("result","FAIL "+e.getClass().getSimpleName()+": "+e.getMessage());finish(0,out);}}
}
