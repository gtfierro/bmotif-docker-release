import { Injectable } from '@angular/core';
import {
  Router, Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot
} from '@angular/router';
import { Observable, of } from 'rxjs'
import { ModelDetailService } from '../model-detail/model-detail.service';
import { Model } from '../types'

@Injectable({
  providedIn: 'root'
})
export class ModelValidateResolver implements Resolve<Model> {

  constructor(private modelDetailService: ModelDetailService) {}

  resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<Model> {
    const id = route.paramMap.get('id') ?? "-1"
    const idInt = parseInt(id);

    return this.modelDetailService.getModel(idInt);
  }
}

