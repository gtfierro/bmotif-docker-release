import { Injectable } from '@angular/core';
import {
  Router, Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot
} from '@angular/router';
import { Observable, forkJoin } from 'rxjs'
import { ModelDetailService } from './model-detail.service';
import { Model } from '../types'
import { map, filter, tap } from 'rxjs/operators'

@Injectable({
  providedIn: 'root'
})
export class ModelDetailResolver implements Resolve<[Model, string, string]> {

  constructor(private modelDetailService: ModelDetailService) {}

  resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<[Model, string, string]> {
    const id = route.paramMap.get('id') ?? "-1"
    const idInt = parseInt(id);

    const model = this.modelDetailService.getModel(idInt);
    const graph = this.modelDetailService.getModelGraph(idInt);
    const manifest = this.modelDetailService.getManifest(idInt);

    return forkJoin([model, graph, manifest])
  }
}
