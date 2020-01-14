// @flow
import React, { createContext, type Node } from 'react';

type Listener = () => mixed;

const StateContext = createContext(null);

export class Container<State: {}> {
  state: State;
  _listeners: Array<Listener> = [];

  constructor() {
    CONTAINER_DEBUG_CALLBACKS.forEach(cb => cb(this));
  }

  setState(
    updater: $Shape<State> | ((prevState: $Shape<State>) => $Shape<State>),
    callback?: () => void
  ): Promise<void> {
    return Promise.resolve().then(() => {
      let nextState;

      if (typeof updater === 'function') {
        nextState = updater(this.state);
      } else {
        nextState = updater;
      }

      if (nextState == null) {
        if (callback) callback();
        return;
      }

      this.state = Object.assign({}, this.state, nextState);

      let promises = this._listeners.map(listener => listener());

      return Promise.all(promises).then(() => {
        if (callback) {
          return callback();
        }
      });
    });
  }

  subscribe(fn: Listener) {
    this._listeners.push(fn);
  }

  unsubscribe(fn: Listener) {
    this._listeners = this._listeners.filter(f => f !== fn);
  }
}

export type ContainerType = Container<Object>;
export type ContainersType = Array<Class<ContainerType> | ContainerType>;
export type ContainerMapType = Map<Class<ContainerType>, ContainerType>;

export type SubscribeProps<Containers: ContainersType> = {
  to: Containers,
  children: (
    ...instances: $TupleMap<Containers, <C>(Class<C> | C) => C>
  ) => Node
};

type SubscribeState = {};

const DUMMY_STATE = {};

export function useContainers(containers: ContainersType) {
  let [instances, setInstances] = useState(null);
  const map = useContext(StateContext);
  if (!instances) {
    instances = createInstances(map, containers);
    setInstances(instances);
  }
  return instances;
}

function createInstances(
  map: ContainerMapType | null,
  containers: ContainersType,
  _this
): Array<ContainerType> {
  if (_this) {
    _this._unsubscribe();
  }

  if (map === null) {
    throw new Error(
      'You must wrap your <Subscribe> components with a <Provider>'
    );
  }

  let safeMap = map;
  let instances = containers.map(ContainerItem => {
    let instance;

    if (
      typeof ContainerItem === 'object' &&
      ContainerItem instanceof Container
    ) {
      instance = ContainerItem;
    } else {
      instance = safeMap.get(ContainerItem);

      if (!instance) {
        instance = new ContainerItem();
        safeMap.set(ContainerItem, instance);
      }
    }

    if (_this) {
      instance.unsubscribe(_this.onUpdate);
      instance.subscribe(_this.onUpdate);
    }

    return instance;
  });

  return instances;
}

export class Subscribe<Containers: ContainersType> extends React.Component<
  SubscribeProps<Containers>,
  SubscribeState
> {
  state = {};
  instances: Array<ContainerType> = [];
  unmounted = false;

  componentWillUnmount() {
    this.unmounted = true;
    this._unsubscribe();
  }

  _unsubscribe() {
    this.instances.forEach(container => {
      container.unsubscribe(this.onUpdate);
    });
  }

  onUpdate: Listener = () => {
    return new Promise(resolve => {
      if (!this.unmounted) {
        this.setState(DUMMY_STATE, resolve);
      } else {
        resolve();
      }
    });
  };

  _createInstances(
    map: ContainerMapType | null,
    containers: ContainersType
  ): Array<ContainerType> {
    const instances = createInstances(map, containers, this.onUpdate);
    this.instances = instances;
    return instances;
  }

  render() {
    return (
      <StateContext.Consumer>
        {map =>
          this.props.children.apply(
            null,
            this._createInstances(map, this.props.to)
          )
        }
      </StateContext.Consumer>
    );
  }
}

export type ProviderProps = {
  inject?: Array<ContainerType>,
  children: Node
};

export function Provider(props: ProviderProps) {
  return (
    <StateContext.Consumer>
      {parentMap => {
        let childMap = new Map(parentMap);

        if (props.inject) {
          props.inject.forEach(instance => {
            childMap.set(instance.constructor, instance);
          });
        }

        return (
          <StateContext.Provider value={childMap}>
            {props.children}
          </StateContext.Provider>
        );
      }}
    </StateContext.Consumer>
  );
}

let CONTAINER_DEBUG_CALLBACKS = [];

// If your name isn't Sindre, this is not for you.
// I might ruin your day suddenly if you depend on this without talking to me.
export function __SUPER_SECRET_CONTAINER_DEBUG_HOOK__(
  callback: (container: Container<any>) => mixed
) {
  CONTAINER_DEBUG_CALLBACKS.push(callback);
}
