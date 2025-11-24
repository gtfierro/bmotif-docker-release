import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RulesComponent } from '../app/rules/rules.component';
import { NamingComponent } from '../app/naming/naming.component';
import { HomeComponent } from '../app/home/home.component';
import { ModelGenerationComponent } from './model-generation/model-generation.component';
import { PointListToTemplateComponent } from '../app/point-list-to-template/point-list-to-template.component';
import { LibraryComponent } from '../app/library/library.component';
import { TemplateDetailComponent } from '../app/template-detail/template-detail.component';
import { TemplateEvaluateComponent} from '../app/template-evaluate/template-evaluate.component'
import { TemplateEvaluateResolver} from '../app/template-evaluate/template-evaluate.resolver'
import { ModelDetailComponent } from '../app/model-detail/model-detail.component';
import { ModelDetailResolver } from '../app/model-detail/model-detail.resolver';
import { ModelNewComponent } from '../app/model-new/model-new.component'
import { ModelValidateComponent } from '../app/model-validate/model-validate.component'
import { ModelValidateResolver } from './model-validate/model-validate.resolver';
import { ModelSearchComponent } from '../app/model-search/model-search.component'
import { ModelSearchResolver } from '../app/model-search/model-search.resolver'
import { TemplateSearchComponent } from '../app/template-search/template-search.component';
import { ManifestGenerateComponent } from '../app/manifest-generate/manifest-generate.component';
import { PointLabelCheckerComponent } from '../app/point-label-checker/point-label-checker.component';
import { PointLabelParserComponent } from './point-label-parser/point-label-parser.component';
import { MappingComponent } from './mapping/mapping.component';
import { LibraryDetailComponent } from '../app/library-detail/library-detail.component';
import { LibraryNewComponent } from '../app/library-new/library-new.component';

const routes: Routes = [
  { path: 'parse-point-labels', component: PointLabelParserComponent},
  { path: 'rules', component: RulesComponent },
  { path: 'naming', component: NamingComponent },
  { path: 'point-list-to-template', component: PointListToTemplateComponent },
  { path: 'model-generation', component: ModelGenerationComponent },
  { path: 'manifest-generate', component: ManifestGenerateComponent },
  { path: 'mapping', component: MappingComponent },
  { path: 'libraries/new', component: LibraryNewComponent },
  { path: 'libraries/:id', component: LibraryDetailComponent },
  { path: 'libraries', component: LibraryComponent },
  { path: 'templates/:id', component: TemplateDetailComponent },
  { path: 'templates/:id/evaluate', component: TemplateEvaluateComponent, resolve: {TemplateEvaluateResolver}},
  { path: 'templates', component: TemplateSearchComponent},
  { path: 'models/new', component: ModelNewComponent},
  { path: 'models/:id', component: ModelDetailComponent, resolve: {ModelDetailResolver}},
  { path: 'models/:id/validate', component: ModelValidateComponent, resolve: {ModelValidateResolver}},
  { path: 'models', component: ModelSearchComponent, resolve: {ModelSearchResolver}},
  { path: 'point-label-checker', component: PointLabelCheckerComponent },
  { path: '', component: HomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
