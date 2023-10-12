import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FormDisplayMode } from '@microsoft/sp-core-library';

import {
  BaseFormCustomizer
} from '@microsoft/sp-listview-extensibility';

import { IFormSolicitacaoFeriasProps } from './components/FormSolicitacaoFerias/FormSolicitacaoFerias.props';

import {
  SPHttpClient,
} from '@microsoft/sp-http';
import FormSolicitacaoFerias from './components/FormSolicitacaoFerias/FormSolicitacaoFerias';
import { PeriodItem } from './components/PeriodosFeriasList/PeriodosFeriasList.props';

/**
 * If your form customizer uses the ClientSideComponentProperties JSON input,
 * it will be deserialized into the BaseExtension.properties object.
 * You can define an interface to describe it.
 */
export interface IHelloWorldFormCustomizerProperties {
  // This is an example; replace with your own property
  sampleText?: string;
}

interface IListItemResponse extends Omit<IFormSolicitacaoFeriasProps["item"], 'DataInicio' | 'DataFim'> {
  DataInicio: string,
  DataFim: string
}

export default class HelloWorldFormCustomizer
  extends BaseFormCustomizer<IHelloWorldFormCustomizerProperties> {

  // Added for the item to show in the form; use with edit and view form
  private _item: IFormSolicitacaoFeriasProps['item'];
  private _periods: IFormSolicitacaoFeriasProps['periods'] = [];

  private secondaryListId: string = 'ff367779-18a9-43f1-8ffc-7237dc66ec80'

  private _allUsersList: {
    internalName: string,
    title: string,
    guid: string
  }

  private _isUserManager: boolean

  private _isMemberOfHR: boolean

  private _userItems: IFormSolicitacaoFeriasProps["item"][];

  private async ensureUserByLoginName(loginName: string): Promise<any> {
    const response = await this.context.spHttpClient.post(`${this.context.pageContext.site.absoluteUrl}/_api/web/ensureuser`,
      SPHttpClient.configurations.v1,
      {
        body: JSON.stringify({
          'logonName': loginName
        })
      })

    return await response.json()
  }

  private async _getManagerProfile(): Promise<{Id: number}> {    
    const {
      loginName 
    } = this.context.pageContext.user
    
    const response = await this.context.spHttpClient
      .get(
        this.context.pageContext.web.absoluteUrl + `/_api/web/lists/getbytitle('${this._allUsersList.title}')/items?$filter=EMAIL_EMPLOYE eq '${loginName}'&$top=1`,
        SPHttpClient.configurations.v1, {
        headers: {
          accept: 'application/json;odata.metadata=none'
        }
      })

    const responseJSON = response.ok ? response.json() : Promise.reject(response.statusText)

    const { EMAIL_1ST_EVALUATOR: managerEmail } = (await responseJSON).value.shift()

    const managerProfileResponse = await this.ensureUserByLoginName(managerEmail)

    return managerProfileResponse
  }

  private _getUserItems(userId: number): Promise<{
    value: IListItemResponse[]
  }> {
    const { guid } = this.context.list;
    
    // load item to display on the form
    return this.context.spHttpClient
      .get(
        this.context.pageContext.web.absoluteUrl + `/_api/web/lists(guid'${guid}')/items?$filter=AuthorId eq ${userId}&$orderby=ID desc`,
        SPHttpClient.configurations.v1, {
        headers: {
          accept: 'application/json;odata.metadata=none'
        }
      })
      .then(res => {
        if (res.ok) {
          return res.json();
        }
        else {
          return Promise.reject(res.statusText);
        }
      })
  }

  private _getItemData(): Promise<IListItemResponse> {
    const apiUrl = this.context.pageContext.web.absoluteUrl + `/_api/web/lists(guid'${this.context.list.guid}')/items(${this.context.itemId})`
    
    // load item to display on the form
    return this.context.spHttpClient
      .get(apiUrl, SPHttpClient.configurations.v1)
      .then(res => {
        if (res.ok) {
          return res.json();
        }
        else {
          return Promise.reject(res.statusText);
        }
      })
  }

  private async getItemsFromSecondaryList(id: number): Promise<PeriodItem[]> { 
    const apiUrl = this.context.pageContext.web.absoluteUrl + `/_api/web/lists(guid'${this.secondaryListId}')/items?$filter=SolicitacaoFeriasId eq ${id}`

    const getDataResponse = await this.context.spHttpClient.get(apiUrl, SPHttpClient.configurations.v1)
    const { value } = await getDataResponse.json()

    if(value.length === 0) {
      return value
    }

    return value.map((item: any): PeriodItem[] => {
      return {
        ...item,
        DataInicio: new Date(item.DataInicio),
        DataFim: new Date(item.DataFim),
      }
    })
  }

  private async createOnSecondaryList(data: PeriodItem): Promise<PeriodItem> {
    const apiUrl = this.context.pageContext.web.absoluteUrl + `/_api/web/lists(guid'${this.secondaryListId}')/items`
  
    const response = await this.context.spHttpClient.post(apiUrl, SPHttpClient.configurations.v1, {
      headers: {
        'Content-Type': "application/json;odata=nometadata" 
      },
      body: JSON.stringify(data),
    });

    if (response.status === 204) {
      return 
    } else {
      const responseJson = await response.json();
      return responseJson;
    }
  }

  private async _createItem(
    item: IFormSolicitacaoFeriasProps['item'], 
    periods: IFormSolicitacaoFeriasProps['periods']
  ): Promise<IFormSolicitacaoFeriasProps['item']> {
    
    const { guid } = this.context.list;
    const {
      ...itemToSave
    } = item

    const postResponse = await this.context.spHttpClient
      .post(this.context.pageContext.web.absoluteUrl + `/_api/web/lists(guid'${guid}')/items`, 
        SPHttpClient.configurations.v1, {
        headers: {
          'content-type': 'application/json;odata.metadata=none'
        },
        body: JSON.stringify(itemToSave)
      });

    const responseJSON = postResponse.ok ? await postResponse.json() : Promise.reject(postResponse.statusText)

    for (const period of periods) {
      await this.createOnSecondaryList({
        ...period,
        SolicitacaoFeriasId: responseJSON.Id
      })
    }   

    return responseJSON
  }

  private async _updateItem(item: IFormSolicitacaoFeriasProps['item'], periods: IFormSolicitacaoFeriasProps['periods']): Promise<any> {
    const { guid } = this.context.list;
    const {
      ...itemToSave
    } = item

    const apiUrl = this.context.pageContext.web.absoluteUrl + `/_api/web/lists(guid'${guid}')/items(${this.context.pageContext.listItem.id})`

    await this.context.spHttpClient.post(apiUrl, SPHttpClient.configurations.v1, {
      headers: {
        'Content-Type': 'application/json;odata.metadata=none',
        "IF-MATCH": '*',
        "X-HTTP-Method": 'MERGE',
        "accept": "application/json;odata=verbose",
      },
      body: JSON.stringify(itemToSave)
    });

    if(this._periods.length > 0) {
      await Promise.all(this._periods.map(async period => await this.deleteItemFromSecondaryList(period.Id)))
      this._periods = []
    }

    for (const period of periods) {
      await this.createOnSecondaryList({
        ...period,
        SolicitacaoFeriasId: this.context.pageContext.listItem.id
      })
    }

    return Promise.resolve()
  }

  private async deleteItemFromSecondaryList(id: number): Promise<void> { 
    const apiUrl = this.context.pageContext.web.absoluteUrl + `/_api/web/lists(guid'${this.secondaryListId}')/items(${id})`

    const response = await this.context.spHttpClient.fetch(apiUrl, SPHttpClient.configurations.v1, {
      method: 'DELETE',
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "IF-MATCH": '*'
      },
    })

    if(response.ok) {
      return Promise.resolve()
    }
    else {
      await Promise.reject(response.statusText)
    }
  }

  public async onInit(): Promise<void> {
    this._allUsersList = {
      internalName: 'hierarquia_cjtrade',
      title: 'hierarquia_cjtrade',
      guid: '1733062b-2634-43fc-8207-42fe20b40ac4'   
    }

    try {
      if (this.displayMode === FormDisplayMode.New) {
        
          // we're creating a new item so nothing to load
          const managerProfile = await this._getManagerProfile()

          this._item = {
            Status: 'Draft',
            GestorId: managerProfile.Id,
            AbonoQuantidadeDias: 0,
            Observacao: null,
            QtdDias: '30 dias de descanso',
            AuthorId: null,
            ObservacaoGestor: null,
            ObservacaoRH: null,
            PeriodoAquisitivo: null,
          }        

          const userItems = await this._getUserItems(this.context.pageContext.legacyPageContext.userId)
        
          this._userItems = userItems.value.map(item => {
            return {
              ...item,
              DataFim: new Date(item.DataFim),
              DataInicio: new Date(item.DataInicio),
            }
          })

      }
      else {
        const currentItemData = await this._getItemData()

        this._isUserManager = currentItemData.GestorId === this.context.pageContext.legacyPageContext.userId

        this._isMemberOfHR = await this.isMemberOfGroup(139) 

        this._item= {
          ...currentItemData,
        }

        this._periods = await this.getItemsFromSecondaryList(this.context.pageContext.listItem.id)

        const userItems = await this._getUserItems(currentItemData.AuthorId)

        this._userItems = userItems.value.map(item => {
          return {
            ...item,
            DataFim: new Date(item.DataFim),
            DataInicio: new Date(item.DataInicio),
          }
        })
      }
    }  
    catch(error) {
      throw Error(error)
    }
  }

  private async getCurrentUserGroups(): Promise<any> {
    const queryUrl = `${this.context.pageContext.web.absoluteUrl}/_api/web/currentuser/groups`;
    const siteGroupsData = await this.context.spHttpClient.get(queryUrl, SPHttpClient.configurations.v1);
    const siteGroups = (await siteGroupsData.json()).value;

    return siteGroups
  }

  private async isMemberOfGroup(groupId: number): Promise<boolean> {
    const userGroups = await this.getCurrentUserGroups()
    const group = userGroups.find((group: {Id: number}) => group.Id === groupId)
    return !!group
  }

  private updateItem(guid: string, id: number, data: any): Promise<void> {
    const apiUrl = `${this.context.pageContext.web.absoluteUrl}/_api/web/lists(guid'${guid}')/items(${id})`

    return this.context.spHttpClient.post(apiUrl, SPHttpClient.configurations.v1, {
      headers: {
        'Content-Type': 'application/json;odata.metadata=none',
        "IF-MATCH": '*',
        "X-HTTP-Method": 'MERGE',
        'Odata-Version' : '4.0'
      },
      body: JSON.stringify(data)
    })
    .then(res => {
      if (res.ok) {
        res.json();
        return Promise.resolve();
      }
      else {
        return Promise.reject(res.statusText);
      }
    })
  }

  public render(): void {
    // Use this method to perform your custom rendering.
    const helloWorld: React.ReactElement<{}> =
      React.createElement(FormSolicitacaoFerias, {
        context: this.context,
        displayMode: this.displayMode,
        item: this._item,
        onSave: this._onSave,
        onClose: this._onClose,
        isUserManager: this._isUserManager,
        isMemberOfHR: this._isMemberOfHR,
        isAuthor: this._item.AuthorId === this.context.pageContext.legacyPageContext.userId,
        userItems: this._userItems,
        periods: this._periods,
        userDisplayName: this.context.pageContext.user.displayName,
        updateItem: this.updateItem.bind(this),
       } as IFormSolicitacaoFeriasProps);

    ReactDOM.render(helloWorld, this.domElement);
  }

  public onDispose(): void {
    // This method should be used to free any resources that were allocated during rendering.
    ReactDOM.unmountComponentAtNode(this.domElement);
    super.onDispose();
  }

  private _onSave = async (item: IFormSolicitacaoFeriasProps['item'], periods: IFormSolicitacaoFeriasProps['periods']): Promise<Promise<void>> => {
    if(this.displayMode === FormDisplayMode.New) {
      await this._createItem(item, periods);
    }
    else {
      await this._updateItem(item, periods);
    }

    window.location.reload()
  }

  private _onClose= (): void=> {
    window.location.href = '/sites/newportal'
  }
}
